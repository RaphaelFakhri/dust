import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import { useMembersUsage } from "@app/lib/swr/memberships";
import type { GroupType } from "@app/types/groups";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";

interface UpgradeRequestLimitModalProps {
  owner: LightWorkspaceType;
  request: MembershipUpgradeRequestType;
  groups: GroupType[];
  editableGroupIds: ReadonlySet<string>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @cc [owner:philipperolet,label:product] request-limit-save-order
 * The editor MUST load current limits for the exact requester before enabling edits.
 * `onSaved` MUST run only after a limit change succeeds, never on cancellation or a failed save.
 */
export function UpgradeRequestLimitModal({
  owner,
  request,
  groups,
  editableGroupIds,
  onClose,
  onSaved,
}: UpgradeRequestLimitModalProps) {
  const { membersUsage, isMembersUsageLoading, isMembersUsageError } =
    useMembersUsage({
      workspaceId: owner.sId,
      searchTerm: request.requester.email ?? request.requester.name,
      pageIndex: 0,
      pageSize: 25,
    });
  const member = membersUsage.find(
    (member) => member.sId === request.requester.sId
  );

  // Never initialize the editor with fabricated limits when the member cannot be loaded.
  if (isMembersUsageLoading || isMembersUsageError || !member) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Edit spend limit for {request.requester.name}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {isMembersUsageLoading ? (
              <Spinner />
            ) : (
              "Could not load this member's current limits. Close and try again."
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EditMemberSpendLimitModal
      isOpen
      member={member}
      owner={owner}
      groups={groups}
      editableGroupIds={editableGroupIds}
      canEditDefaultLimit={false}
      defaultUserSpendLimit={
        member.spendLimitSource === "default" &&
        member.spendLimitAwuCredits !== null
          ? {
              status: "ready",
              awuCredits: Math.max(
                0,
                member.spendLimitAwuCredits - (member.memberUsageLimit ?? 0)
              ),
            }
          : { status: "unavailable" }
      }
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
