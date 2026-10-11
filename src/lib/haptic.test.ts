import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerHaptic, isReducedMotionPreferred } from "./haptic";

describe("haptic utility", () => {
  const originalVibrate = navigator.vibrate;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Reset matchMedia to not preferring reduced motion
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    navigator.vibrate = originalVibrate;
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("returns false if navigator.vibrate is unavailable", () => {
    // @ts-expect-error test unavailable navigator.vibrate
    navigator.vibrate = undefined;
    expect(triggerHaptic("tick")).toBe(false);
  });

  it("triggers 12ms tick when type is tick", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    navigator.vibrate = vibrateMock;

    const result = triggerHaptic("tick");
    expect(result).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(12);
  });

  it("triggers [15, 30, 15]ms pattern when type is success", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    navigator.vibrate = vibrateMock;

    const result = triggerHaptic("success");
    expect(result).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith([15, 30, 15]);
  });

  it("suppresses vibration when user prefers reduced motion", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const vibrateMock = vi.fn().mockReturnValue(true);
    navigator.vibrate = vibrateMock;

    expect(isReducedMotionPreferred()).toBe(true);
    const result = triggerHaptic("tick");
    expect(result).toBe(false);
    expect(vibrateMock).not.toHaveBeenCalled();
  });
});
