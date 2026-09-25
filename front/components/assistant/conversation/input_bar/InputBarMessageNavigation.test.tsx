import { InputBarMessageNavigation } from "@app/components/assistant/conversation/input_bar/InputBarMessageNavigation";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("InputBarMessageNavigation", () => {
  it("keeps the scroll target mounted while arrows swap with Stop and dots", async () => {
    const props = {
      variant: "floating" as const,
      showStopButton: false,
      showMessageNavigation: true,
      stopButtonLabel: "Stop",
      hasPendingMessages: false,
      pendingAction: null,
      onStopClick: vi.fn(),
      canScrollUp: true,
      canScrollDown: true,
      onScrollUp: vi.fn(),
      onScrollDown: vi.fn(),
      onScrollToResponse: vi.fn(),
    };
    const { rerender } = render(
      <InputBarMessageNavigation {...props} responseNavigation="idle" />
    );
    const scrollButton = screen.getByRole("button", {
      name: "Next user message",
    });

    rerender(
      <InputBarMessageNavigation
        {...props}
        showStopButton
        responseNavigation="streaming"
      />
    );
    expect(screen.getByRole("button", { name: "Jump to latest answer" })).toBe(
      scrollButton
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    rerender(
      <InputBarMessageNavigation {...props} responseNavigation="idle" />
    );
    expect(screen.getByRole("button", { name: "Next user message" })).toBe(
      scrollButton
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    );
  });

  it("takes readers to the active answer and then to the completed answer", async () => {
    const onScrollDown = vi.fn();
    const onScrollToResponse = vi.fn();
    const props = {
      variant: "floating" as const,
      showStopButton: false,
      showMessageNavigation: true,
      stopButtonLabel: "Stop",
      hasPendingMessages: false,
      pendingAction: null,
      onStopClick: vi.fn(),
      canScrollUp: false,
      canScrollDown: true,
      onScrollUp: vi.fn(),
      onScrollDown,
      onScrollToResponse,
    };

    const { rerender } = render(
      <InputBarMessageNavigation {...props} responseNavigation="streaming" />
    );

    const answerButton = screen.getByRole("button", {
      name: "Jump to latest answer",
    });
    fireEvent.click(answerButton);
    expect(onScrollToResponse).toHaveBeenCalledTimes(1);
    expect(onScrollDown).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Previous user message" })
    ).not.toBeInTheDocument();

    act(() => answerButton.focus());
    rerender(
      <InputBarMessageNavigation {...props} responseNavigation="ready" />
    );

    const completedAnswerButton = screen.getByRole("button", {
      name: "Answer ready, go to bottom",
    });
    expect(completedAnswerButton).toBe(answerButton);
    expect(completedAnswerButton).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Done");
    expect(
      screen.getByRole("button", { name: "Previous user message" })
    ).toBeInTheDocument();
    fireEvent.click(completedAnswerButton);
    expect(onScrollToResponse).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole(
        "button",
        { name: "Previous user message" },
        { timeout: 2000 }
      )
    ).toBeInTheDocument();

    rerender(
      <InputBarMessageNavigation {...props} responseNavigation="idle" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next user message" }));
    expect(onScrollDown).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("keeps the active answer reachable beside Stop in compact mode", () => {
    const onScrollToResponse = vi.fn();

    render(
      <InputBarMessageNavigation
        variant="compact"
        showStopButton
        showMessageNavigation
        stopButtonLabel="Stop"
        hasPendingMessages={false}
        pendingAction={null}
        onStopClick={vi.fn()}
        canScrollUp={false}
        canScrollDown={false}
        onScrollUp={vi.fn()}
        onScrollDown={vi.fn()}
        responseNavigation="streaming"
        onScrollToResponse={onScrollToResponse}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to latest answer" })
    );
    expect(onScrollToResponse).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Previous user message" })
    ).not.toBeInTheDocument();
  });
});
