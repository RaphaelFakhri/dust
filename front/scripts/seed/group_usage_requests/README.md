# Group usage requests

Local fixtures for stream 2B of the [group management plan](../../../../../x/pr/observe-v2/group-management-plan.md).

From this hive's root:

```bash
source ~/.dust-hive/envs/group-manager-usage/env.sh
cd front
npx tsx scripts/seed/group_usage_requests/seed.ts
npx tsx scripts/seed/group_usage_requests/seed.ts --execute
```

The script accepts only a local development database. It enables `group_management` in
`DevWkSpace`, creates the following sample users and groups, queues user search indexing, and
creates pending requests without sending emails or calling billing services.

| User | Group membership | Request visible to Taylor |
| --- | --- | --- |
| Taylor Manager (`SeedUsageManager`) | None; manages Support and Sales | — |
| Alex Support (`SeedUsageMember`) | Usage requests: Support | Yes |
| Sam Overlap (`SeedUsageOverlap`) | Usage requests: Support and Sales | Yes, once |
| Jordan Outside (`SeedUsageOutside`) | Usage requests: Other | No |

Re-running reuses existing users, groups, grants, and pending requests. After resolving a request,
re-running creates a new pending request. Existing group memberships and limits are not reset.
The final log reads the requests as Taylor through the real permission checks.

## Browser setup

The seeded users have no WorkOS login. To exercise an authenticated group-manager session, appoint
an existing local workspace member as well:

```bash
npx tsx scripts/seed/group_usage_requests/seed.ts --managerUserId YOUR_LOCAL_USER_ID --execute
```

Use a user with the ordinary User role; a workspace Manager or Admin sees the workspace-wide page.
The script never changes an existing user's workspace role or the workspace's subscription.
Requests are shown only on a credit-priced plan. This hive currently has a free upgraded plan;
an authenticated end-to-end browser check needs a local credit-priced workspace first. Set
`DEV_WORKSPACE_SID` to use a different local workspace.

Open `http://localhost:17011/w/DevWkSpace/usage` (adjust ports and workspace for another hive).

## Manual checks

1. In Members → Requests, Taylor sees Alex and Sam, with count 2, and no Upgrade plan action.
2. Filter Sales: only Sam remains. Clear the filter: Alex and Sam return. Search also narrows the count.
3. Deny Alex and confirm. The request disappears. Canceling confirmation sends no update.
4. Edit Sam's limit, change the personal limit, and save. The limit PUT succeeds before request
   approval PATCH. Canceling the editor or failing the limit save leaves the request pending.
5. Open a request in two manager sessions. Resolve it in the first, then save a limit in the second.
   The second session explains that the limit was saved but approval failed, and refreshes requests.
6. Open Alex's request, remove Alex from Support using an admin session, then save. Both limit
   editing and direct request resolution must reject the action.
7. Disable `group_management`: delegated request GET/PATCH return 403. Workspace managers retain access.

## Automated permission checks

From the hive root with its environment loaded:

```bash
npm -w front-api test -- 'routes/w/[wId]/credits/upgrade-requests.test.ts'
```

These tests use the hive test database and cover scope, overlap, filtering, membership removal,
workspace isolation, feature gating, audit attribution, and concurrent resolution.
