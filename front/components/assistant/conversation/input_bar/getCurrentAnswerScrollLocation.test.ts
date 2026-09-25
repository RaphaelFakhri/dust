import {
  getCurrentAnswerScrollLocation,
  getCurrentGeneratingMessageId,
} from "@app/components/assistant/conversation/input_bar/getCurrentAnswerScrollLocation";
import { describe, expect, it } from "vitest";

describe("getCurrentAnswerScrollLocation", () => {
  it("aligns the newest tokens of the active answer with the viewport", () => {
    const messages = [
      { sId: "user", type: "user_message" },
      { sId: "active", type: "agent_message", status: "created" },
      { sId: "steering", type: "user_message" },
    ];

    expect(getCurrentAnswerScrollLocation(messages, "active")).toEqual({
      index: 1,
      align: "end",
      behavior: "instant",
    });
  });

  it("finds a running answer when its ID has not reached the navigation yet", () => {
    const messages = [
      { sId: "older", type: "agent_message", status: "succeeded" },
      { sId: "active", type: "agent_message", status: "created" },
    ];

    expect(getCurrentAnswerScrollLocation(messages, "pending")).toEqual({
      index: 1,
      align: "end",
      behavior: "instant",
    });
  });
});

describe("getCurrentGeneratingMessageId", () => {
  it("keeps the resumed answer streaming until its message is terminal", () => {
    const generatingMessages = [{ messageId: "asked-question" }];

    expect(
      getCurrentGeneratingMessageId(
        [{ sId: "asked-question", type: "agent_message", status: "created" }],
        generatingMessages
      )
    ).toBe("asked-question");
    expect(
      getCurrentGeneratingMessageId(
        [
          {
            sId: "asked-question",
            type: "agent_message",
            status: "succeeded",
          },
        ],
        generatingMessages
      )
    ).toBeUndefined();
  });

  it("ignores a completed answer still registered as generating", () => {
    const messages = [
      { sId: "question", type: "agent_message", status: "created" },
      { sId: "continued", type: "agent_message", status: "succeeded" },
    ];

    expect(
      getCurrentGeneratingMessageId(messages, [
        { messageId: "question" },
        { messageId: "continued" },
      ])
    ).toBe("question");
    expect(
      getCurrentGeneratingMessageId(
        [{ ...messages[0], status: "succeeded" }, messages[1]],
        [{ messageId: "question" }, { messageId: "continued" }]
      )
    ).toBeUndefined();
  });

  it("keeps a registered answer active before its row reaches the list", () => {
    expect(
      getCurrentGeneratingMessageId([], [{ messageId: "new-answer" }])
    ).toBe("new-answer");
  });
});
