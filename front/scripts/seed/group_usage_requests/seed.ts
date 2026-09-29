import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { dbConfig } from "@app/lib/resources/storage/config";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { createSeedContext } from "@app/scripts/seed/factories/seedContext";
import { seedGroup } from "@app/scripts/seed/factories/seedGroup";
import { seedUsers } from "@app/scripts/seed/factories/seedUsers";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import { isDevelopment } from "@app/types/shared/env";
import assert from "assert";

const USERS = [
  { sId: "SeedUsageManager", firstName: "Taylor", lastName: "Manager" },
  { sId: "SeedUsageMember", firstName: "Alex", lastName: "Support" },
  { sId: "SeedUsageOverlap", firstName: "Sam", lastName: "Overlap" },
  { sId: "SeedUsageOutside", firstName: "Jordan", lastName: "Outside" },
].map((user) => ({
  ...user,
  username: user.sId,
  email: `${user.sId.toLowerCase()}@example.test`,
}));

makeScript(
  {
    managerUserId: {
      type: "string",
      describe: "Optionally also appoint an existing local user as manager",
    },
  },
  async ({ execute, managerUserId }, logger) => {
    const database = new URL(dbConfig.getRequiredFrontDatabaseURI());
    assert(
      isDevelopment() && ["localhost", "127.0.0.1"].includes(database.hostname),
      "This seed is only for local development databases."
    );
    const ctx = await createSeedContext({ execute, logger });
    logger.info(
      "Seed two managed groups, one overlapping requester, and one outsider. No emails are sent."
    );
    if (!execute) {
      return;
    }

    // Sample users have no WorkOS identities; keep membership creation local.
    const users = await seedUsers(
      {
        ...ctx,
        workspace: { ...ctx.workspace, workOSOrganizationId: null },
      },
      USERS
    );
    const manager = users.get("SeedUsageManager");
    const member = users.get("SeedUsageMember");
    const overlap = users.get("SeedUsageOverlap");
    const outsider = users.get("SeedUsageOutside");
    assert(manager && member && overlap && outsider);
    const managers = [manager];
    if (managerUserId) {
      const user = await UserResource.fetchById(managerUserId);
      assert(user, "Manager user not found.");
      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        ctx.workspace.sId
      );
      assert(auth.isUser(), "The manager must be an active workspace member.");
      managers.push(user);
    }

    if (!(await ctx.auth.hasFeatureFlag("group_management"))) {
      await FeatureFlagResource.enable(ctx.workspace, "group_management");
    }
    const existingGroups = await GroupResource.listAllWorkspaceGroups(
      ctx.auth,
      { groupKinds: ["regular_manual"] }
    );
    const groupsByName = new Map(
      existingGroups.map((group) => [group.name, group])
    );
    for (const spec of [
      {
        name: "Usage requests: Support",
        members: [member, overlap],
        managed: true,
      },
      { name: "Usage requests: Sales", members: [overlap], managed: true },
      { name: "Usage requests: Other", members: [outsider], managed: false },
    ]) {
      const group =
        groupsByName.get(spec.name) ??
        (await seedGroup(ctx, { ...spec, kind: "regular_manual" }));
      assert(group);
      if (spec.managed) {
        for (const user of managers) {
          const grant = await GroupPermissionResource.grantToUser(ctx.auth, {
            user: user.toJSON(),
            grantType: "group_manager",
            resourceType: "group",
            resourceId: group.id,
          });
          assert(grant.isOk());
        }
      }
      logger.info({ groupId: group.sId, name: group.name }, "Group ready");
    }
    for (const user of [member, overlap, outsider]) {
      const request = await MembershipUpgradeRequestResource.createPending(
        ctx.auth,
        {
          user,
          reason: "Please increase my credit limit for this week's work.",
          reasonRequired: false,
        }
      );
      assert(request.isOk());
      const indexed = await launchIndexUserSearchWorkflow({ userId: user.sId });
      assert(indexed.isOk());
    }
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      ctx.workspace.sId
    );
    const visibleRequests =
      await MembershipUpgradeRequestResource.listPendingByWorkspace(
        managerAuth
      );
    logger.info(
      {
        managerUserId: manager.sId,
        visibleRequests: visibleRequests.map(
          (request) => request.requester.sId
        ),
      },
      "Expected: Alex and Sam, once each. Jordan stays outside the scope."
    );
  }
);
