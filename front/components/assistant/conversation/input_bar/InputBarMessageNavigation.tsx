import {
  INPUT_BAR_COMPACT_PILL_CLASSES,
  INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
  INPUT_BAR_SURFACE_CLASSES,
} from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import {
  ArrowDown,
  ArrowUp,
  Button,
  CheckCircle,
  cn,
  Stop,
  Zap,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import styles from "./InputBarMessageNavigation.module.css";

interface InputBarMessageNavigationProps {
  variant: "floating" | "compact";
  showStopButton: boolean;
  showMessageNavigation: boolean;
  stopButtonLabel: string;
  hasPendingMessages: boolean;
  pendingAction: "stop" | "interrupt" | null;
  onStopClick: () => void;
  canScrollUp: boolean;
  canScrollDown: boolean;
  onScrollUp: () => void;
  onScrollDown: () => void;
  responseNavigation: "idle" | "streaming" | "ready";
  onScrollToResponse: () => void;
}

const SWAP_EASE = [0.645, 0.045, 0.355, 1] as const;
const SWAP_DURATION = 0.36;
const SWAP_EXIT_DURATION = 0.28;

/**
 * @cc [owner:id13,label:react;product] answer-navigation-keeps-target
 * In floating navigation, the down/answer button MUST retain its DOM identity
 * across idle, streaming, and ready states so a focused control remains usable.
 */
export function InputBarMessageNavigation({
  variant,
  showStopButton,
  showMessageNavigation,
  stopButtonLabel,
  hasPendingMessages,
  pendingAction,
  onStopClick,
  canScrollUp,
  canScrollDown,
  onScrollUp,
  onScrollDown,
  responseNavigation,
  onScrollToResponse,
}: InputBarMessageNavigationProps) {
  const shouldReduceMotion = useReducedMotion();
  const [completionCue, setCompletionCue] = useState({
    responseNavigation,
    visible: responseNavigation === "ready",
  });

  if (completionCue.responseNavigation !== responseNavigation) {
    setCompletionCue({
      responseNavigation,
      visible: responseNavigation === "ready",
    });
  }

  const showCompletionCue =
    responseNavigation === "ready" &&
    completionCue.visible &&
    showMessageNavigation &&
    !(variant === "compact" && showStopButton);

  useEffect(() => {
    if (!showCompletionCue) {
      return;
    }

    const timeout = window.setTimeout(
      () => setCompletionCue((cue) => ({ ...cue, visible: false })),
      shouldReduceMotion ? 350 : 750
    );

    return () => window.clearTimeout(timeout);
  }, [showCompletionCue, shouldReduceMotion]);

  const stopButtonVariant = variant === "compact" ? "ghost-secondary" : "ghost";
  const isStopActionPending = pendingAction !== null;
  const stopIcon = hasPendingMessages ? Zap : Stop;
  const showNavigationArrows =
    showMessageNavigation &&
    responseNavigation !== "streaming" &&
    !(variant === "compact" && showStopButton);
  const showResponseNavigation =
    showMessageNavigation && responseNavigation === "streaming";
  const showScrollButton =
    showResponseNavigation || showCompletionCue || showNavigationArrows;
  const downLabel =
    responseNavigation === "ready"
      ? "Answer ready, go to bottom"
      : "Next user message";

  const stopButton =
    variant === "compact" && isStopActionPending ? (
      <Button
        variant={stopButtonVariant}
        label={stopButtonLabel}
        onClick={onStopClick}
        disabled
        size={variant === "compact" ? "mini" : "xs"}
      />
    ) : (
      <Button
        variant={stopButtonVariant}
        label={variant === "compact" ? undefined : stopButtonLabel}
        icon={stopIcon}
        aria-label={variant === "compact" ? stopButtonLabel : undefined}
        onClick={onStopClick}
        disabled={pendingAction !== null}
        size={variant === "compact" ? "mini" : "xs"}
      />
    );

  const controls = (
    <>
      <span className="relative inline-flex items-center gap-1 overflow-hidden empty:hidden focus-within:overflow-visible">
        <AnimatePresence initial={false} mode="popLayout">
          {showStopButton && (
            <motion.span
              key="stop"
              className="inline-flex items-center gap-1"
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : -8,
                pointerEvents: "none",
                transition: {
                  duration: shouldReduceMotion ? 0.1 : SWAP_EXIT_DURATION,
                },
              }}
              transition={{
                duration: shouldReduceMotion ? 0.1 : SWAP_DURATION,
                ease: SWAP_EASE,
              }}
            >
              {stopButton}
              {showNavigationArrows && variant !== "compact" && (
                <div className="h-4 w-px bg-border" />
              )}
            </motion.span>
          )}
          {showNavigationArrows && (
            <motion.span
              key="up"
              className="inline-flex"
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : 8,
                pointerEvents: "none",
                transition: {
                  duration: shouldReduceMotion ? 0.1 : SWAP_EXIT_DURATION,
                },
              }}
              transition={{
                duration: shouldReduceMotion ? 0.1 : SWAP_DURATION,
                ease: SWAP_EASE,
              }}
            >
              <Button
                variant={variant === "compact" ? "ghost-secondary" : "ghost"}
                icon={ArrowUp}
                size={variant === "compact" ? "mini" : "xs"}
                onClick={onScrollUp}
                disabled={!canScrollUp}
                tooltip="Previous user message"
                aria-label="Previous user message"
              />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {showScrollButton && (
        <motion.span
          className="inline-flex"
          layout={shouldReduceMotion ? false : "position"}
          transition={{ duration: SWAP_DURATION, ease: SWAP_EASE }}
        >
          <Button
            variant={variant === "compact" ? "ghost-secondary" : "ghost"}
            size={variant === "compact" ? "mini" : "xs"}
            icon={
              <span className={styles.navigationIcon} aria-hidden="true">
                <span
                  className={cn(
                    styles.iconLayer,
                    styles.dotsLayer,
                    !showResponseNavigation && styles.iconHidden
                  )}
                >
                  <span className={styles.dots}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </span>
                </span>
                <span
                  className={cn(
                    styles.iconLayer,
                    styles.completionLayer,
                    showCompletionCue && styles.completionVisible
                  )}
                >
                  <CheckCircle className="h-5 w-5 text-success-500" />
                </span>
                <span
                  className={cn(
                    styles.iconLayer,
                    styles.arrowLayer,
                    (showResponseNavigation || showCompletionCue) &&
                      styles.iconHidden
                  )}
                >
                  <ArrowDown
                    className={variant === "compact" ? "h-5 w-5" : "h-4 w-4"}
                  />
                </span>
              </span>
            }
            tooltip={
              showResponseNavigation ? "Jump to latest answer" : downLabel
            }
            aria-label={
              showResponseNavigation ? "Jump to latest answer" : downLabel
            }
            onClick={
              responseNavigation === "idle" ? onScrollDown : onScrollToResponse
            }
            disabled={responseNavigation === "idle" && !canScrollDown}
          />
        </motion.span>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {showCompletionCue && (
          <motion.span
            key="done"
            className="text-sm font-medium text-muted-foreground"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0.12 : SWAP_DURATION,
              ease: SWAP_EASE,
            }}
          >
            Done
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );

  if (variant === "compact") {
    return (
      <div className={INPUT_BAR_COMPACT_PILL_CLASSES}>
        <div className={cn("relative", INPUT_BAR_COMPACT_PILL_INNER_CLASSES)}>
          {controls}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout={shouldReduceMotion ? false : "size"}
      transition={{
        layout: {
          type: "tween",
          duration: SWAP_DURATION,
          ease: SWAP_EASE,
        },
      }}
      className={cn("flex items-center gap-1 p-1", INPUT_BAR_SURFACE_CLASSES)}
      style={{
        position: "absolute",
        top: "-2rem",
        borderRadius: 12,
      }}
    >
      {controls}
    </motion.div>
  );
}
