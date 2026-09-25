type Message = {
  sId: string;
  type: string;
  status?: string;
};

/**
 * @cc [owner:id13,label:react;product] terminal-answer-does-not-stream
 * Navigation MUST NOT show a streaming answer for a registered agent message whose
 * current list row is no longer `created`. A registered ID without a row remains
 * eligible while the message is being inserted into the list.
 */
export function getCurrentGeneratingMessageId(
  messages: Message[],
  generatingMessages: { messageId: string }[]
): string | undefined {
  return generatingMessages.findLast(({ messageId }) => {
    const message = messages.find(({ sId }) => sId === messageId);
    return (
      !message ||
      (message.type === "agent_message" && message.status === "created")
    );
  })?.messageId;
}

export function getCurrentAnswerScrollLocation(
  messages: Message[],
  currentMessageId: string | undefined
) {
  const currentMessageIndex = messages.findIndex(
    (message) => message.sId === currentMessageId
  );
  const fallbackMessageIndex = messages.findLastIndex(
    (message) =>
      message.type === "agent_message" && message.status === "created"
  );
  const index =
    currentMessageIndex >= 0
      ? currentMessageIndex
      : fallbackMessageIndex >= 0
        ? fallbackMessageIndex
        : ("LAST" as const);

  return { index, align: "end" as const, behavior: "instant" as const };
}
