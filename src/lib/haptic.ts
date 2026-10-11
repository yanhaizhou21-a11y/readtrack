export type HapticFeedbackType = "tick" | "success";

/**
 * Checks if the user prefers reduced motion.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Triggers tactical haptic feedback via Web Vibration API with safe fallbacks.
 * - tick: 12ms light tick for bookmark toggle, highlight color pick, reminder save.
 * - success: [15, 30, 15]ms pattern for chapter completion and import success.
 */
export function triggerHaptic(type: HapticFeedbackType = "tick"): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  if (typeof navigator.vibrate !== "function") {
    return false;
  }

  if (isReducedMotionPreferred()) {
    return false;
  }

  try {
    if (type === "tick") {
      return navigator.vibrate(12);
    }
    if (type === "success") {
      return navigator.vibrate([15, 30, 15]);
    }
  } catch (err) {
    console.debug("Haptic vibration suppressed:", err);
  }

  return false;
}
