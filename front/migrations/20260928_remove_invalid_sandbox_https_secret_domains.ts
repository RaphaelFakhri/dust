import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import {
  normalizeHttpsSecretAllowedDomains,
  renderSandboxEnvVarName,
} from "@app/lib/api/sandbox/env_vars";
import type { AuditLogActor } from "@app/lib/api/workos/organization";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

const AUDIT_ACTOR: AuditLogActor = {
  type: "system",
  id: "sandbox-https-secret-domain-repair",
  name: "Sandbox HTTPS secret domain repair",
};
const AUDIT_EMIT_CONCURRENCY = 4;

// Drops allowed domains that dsbx rejects (single-label exact entries such as
// `localhost`) from HTTPS secret sandbox env vars. One such entry makes dsbx
// refuse the whole secrets table, so the egress forwarder never binds and
// every sandbox in the workspace fails to start. Front now rejects them at
// write time; this repairs rows written before that.
//
// A row whose list would become empty is reported and left untouched: an
// admin has to set a real domain, and sandboxes in that workspace stay down
// until they do (as today).
//
// Usage (from `front/`):
//   npx tsx -r tsconfig-paths/register migrations/20260928_remove_invalid_sandbox_https_secret_domains.ts [--wId <sId>] [--execute]

export type InvalidDomainRepairStats = {
  invalid: number;
  repaired: number;
  emptied: number;
};

type Repair = {
  row: SandboxEnvVarModel;
  kept: string[];
  dropped: string[];
};

export async function repairWorkspaceSecretDomains(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<InvalidDomainRepairStats> {
  const rows = await SandboxEnvVarModel.findAll({
    where: { workspaceId: workspace.id, kind: "https_secret" },
  });

  const stats: InvalidDomainRepairStats = {
    invalid: 0,
    repaired: 0,
    emptied: 0,
  };
  const repairs: Repair[] = [];

  for (const row of rows) {
    const domains = row.allowedDomains ?? [];
    if (normalizeHttpsSecretAllowedDomains(domains).isOk()) {
      continue;
    }
    stats.invalid++;

    const kept = domains.filter((domain) =>
      normalizeHttpsSecretAllowedDomains([domain]).isOk()
    );
    const dropped = domains.filter((domain) => !kept.includes(domain));
    const localLogger = logger.child({
      workspaceId: workspace.sId,
      sandboxEnvVarModelId: row.id,
      spaceModelId: row.spaceId,
      name: row.name,
      kept,
      dropped,
    });

    if (kept.length === 0) {
      stats.emptied++;
      localLogger.warn(
        "HTTPS secret has no valid allowed domain; needs an admin to set one"
      );
      continue;
    }

    localLogger.info(
      execute
        ? "Dropping invalid allowed domains"
        : "Would drop invalid allowed domains"
    );
    repairs.push({ row, kept, dropped });
  }

  if (!execute || repairs.length === 0) {
    return stats;
  }

  // The attribute maps to a snake_case column; raw SQL bypasses that mapping.
  const domainsColumn =
    SandboxEnvVarModel.getAttributes().allowedDomains.field ?? "allowedDomains";
  // One statement for the workspace: each row gets its own list through
  // parallel unnest arrays, the list carried as JSON text.
  await frontSequelize.query(
    `UPDATE "${SandboxEnvVarModel.tableName}" AS v
     SET "${domainsColumn}" = ARRAY(
       SELECT jsonb_array_elements_text(repairs.domains::jsonb)
     ),
     "updatedAt" = NOW()
     FROM (
       SELECT
         unnest(ARRAY[:ids]::bigint[]) AS id,
         unnest(ARRAY[:domains]::text[]) AS domains
     ) AS repairs
     WHERE v.id = repairs.id AND v."workspaceId" = :workspaceId`,
    {
      replacements: {
        ids: repairs.map(({ row }) => row.id),
        domains: repairs.map(({ kept }) => JSON.stringify(kept)),
        workspaceId: workspace.id,
      },
      type: QueryTypes.UPDATE,
    }
  );
  stats.repaired = repairs.length;

  // emitAuditLogEventDirect never throws. Awaited (bounded) rather than
  // fire-and-forget because makeScript exits the process as soon as this
  // returns, which would drop pending emits.
  await concurrentExecutor(
    repairs,
    async ({ row, kept }) => {
      const envName = renderSandboxEnvVarName({
        kind: row.kind,
        name: row.name,
      });
      await emitAuditLogEventDirect({
        workspace,
        action: "sandbox_env_var.allowed_domains_updated",
        actor: AUDIT_ACTOR,
        targets: [
          buildAuditLogTarget("workspace", workspace),
          buildAuditLogTarget("sandbox_env_var", {
            sId: makeSId("sandbox_env_var", {
              id: row.id,
              workspaceId: workspace.id,
            }),
            name: envName,
          }),
        ],
        context: { location: "internal" },
        // Same keys as SandboxEnvVarResource.updateAllowedDomains, so the
        // registered schema needs no change.
        metadata: {
          name: envName,
          kind: row.kind,
          allowed_domains: JSON.stringify(kept),
          previous_allowed_domains: JSON.stringify(row.allowedDomains ?? []),
          ...(row.spaceId !== null
            ? {
                space_id: SpaceResource.modelIdToSId({
                  id: row.spaceId,
                  workspaceId: workspace.id,
                }),
              }
            : {}),
        },
      });
    },
    { concurrency: AUDIT_EMIT_CONCURRENCY }
  );

  return stats;
}

if (
  process.argv[1]?.endsWith(
    "20260928_remove_invalid_sandbox_https_secret_domains.ts"
  )
) {
  makeScript(
    {
      wId: {
        type: "string",
        describe:
          "Only repair this workspace (sId); defaults to all workspaces",
      },
    },
    async ({ execute, wId }, logger) => {
      const totals: InvalidDomainRepairStats = {
        invalid: 0,
        repaired: 0,
        emptied: 0,
      };

      await runOnAllWorkspaces(
        async (workspace) => {
          const stats = await repairWorkspaceSecretDomains(workspace, {
            execute,
            logger,
          });
          totals.invalid += stats.invalid;
          totals.repaired += stats.repaired;
          totals.emptied += stats.emptied;
        },
        { wId, concurrency: 4 }
      );

      logger.info(
        { ...totals, execute },
        execute
          ? "Invalid HTTPS secret domains removed"
          : "Dry run complete (nothing written; `invalid` counts rows with a rejected domain, `emptied` those left for an admin)"
      );
    }
  );
}
