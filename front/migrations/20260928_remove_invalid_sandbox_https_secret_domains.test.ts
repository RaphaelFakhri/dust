import { randomBytes } from "node:crypto";

import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { repairWorkspaceSecretDomains } from "@app/migrations/20260928_remove_invalid_sandbox_https_secret_domains";
import baseLogger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxEnvVarFactory } from "@app/tests/utils/SandboxEnvVarFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEventDirect } = vi.hoisted(() => ({
  mockEmitAuditLogEventDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEventDirect: mockEmitAuditLogEventDirect };
});

const logger = baseLogger.child({}, { level: "silent" });

describe("repairWorkspaceSecretDomains", () => {
  beforeEach(() => {
    mockEmitAuditLogEventDirect.mockClear();
  });

  it("drops rejected domains, audits the change and leaves emptied rows alone", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const secret = (name: string, allowedDomains: string[]) =>
      SandboxEnvVarFactory.create(authenticator, {
        name,
        kind: "https_secret",
        placeholderNonce: randomBytes(16),
        allowedDomains,
      });
    await secret("HEALTHY", ["api.example.com", "*.example.org"]);
    await secret("MIXED", ["localhost", "api.example.com", "intranet"]);
    await secret("ONLY_INVALID", ["localhost"]);
    // Config vars carry no domains and must not be touched.
    await SandboxEnvVarFactory.create(authenticator, { name: "CONFIG" });

    const scope = { kind: "workspace" as const, workspace };
    const reload = (name: string) =>
      SandboxEnvVarResource.fetchByName(authenticator, scope, name);

    await expect(
      repairWorkspaceSecretDomains(workspace, { execute: false, logger })
    ).resolves.toEqual({ invalid: 2, repaired: 0, emptied: 1 });
    expect((await reload("MIXED"))?.allowedDomains).toEqual([
      "localhost",
      "api.example.com",
      "intranet",
    ]);
    expect(mockEmitAuditLogEventDirect).not.toHaveBeenCalled();

    await expect(
      repairWorkspaceSecretDomains(workspace, { execute: true, logger })
    ).resolves.toEqual({ invalid: 2, repaired: 1, emptied: 1 });

    const mixed = await reload("MIXED");
    expect(mixed?.allowedDomains).toEqual(["api.example.com"]);
    expect((await reload("ONLY_INVALID"))?.allowedDomains).toEqual([
      "localhost",
    ]);
    expect((await reload("HEALTHY"))?.allowedDomains).toEqual([
      "api.example.com",
      "*.example.org",
    ]);

    expect(mockEmitAuditLogEventDirect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "sandbox_env_var.allowed_domains_updated",
        actor: expect.objectContaining({ type: "system" }),
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({
            type: "sandbox_env_var",
            id: mixed?.sId,
            name: "DSEC_MIXED",
          }),
        ],
        metadata: expect.objectContaining({
          allowed_domains: JSON.stringify(["api.example.com"]),
          previous_allowed_domains: JSON.stringify([
            "localhost",
            "api.example.com",
            "intranet",
          ]),
        }),
      })
    );

    // The emptied row is still reported, nothing else is left to repair.
    await expect(
      repairWorkspaceSecretDomains(workspace, { execute: true, logger })
    ).resolves.toEqual({ invalid: 1, repaired: 0, emptied: 1 });

    // The repaired secret now builds; the emptied one still fails closed.
    const egress = await SandboxEnvVarResource.listHttpsSecretsForEgress(
      authenticator,
      scope
    );
    expect(egress.isErr()).toBe(true);
    if (egress.isErr()) {
      expect(egress.error.message).toContain("DSEC_ONLY_INVALID");
    }
  });
});
