import { useEffect, useRef, useCallback } from "react";
import { LogicalPosition, ViewportReport, VisibleSegmentRatio, JumpType } from "@/types";
import { startReadingSession, reportViewport, endReadingSession } from "@/features/tracker/api";

interface UseViewportReporterOptions {
  documentId: string;
  initialPosition: LogicalPosition;
  containerRef?: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function useViewportReporter({
  documentId,
  initialPosition,
  containerRef,
  enabled = true,
}: UseViewportReporterOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const currentPositionRef = useRef<LogicalPosition>(initialPosition);
  const lastInteractionTsRef = useRef<number>(Date.now());
  const lastReportTsRef = useRef<number>(0);
  const pendingJumpRef = useRef<JumpType>("none");
  const isInteractingRef = useRef<boolean>(false);

  // Update current position ref when passed from outside
  const updatePosition = useCallback((pos: LogicalPosition) => {
    currentPositionRef.current = pos;
  }, []);

  const setJump = useCallback((jump: JumpType) => {
    pendingJumpRef.current = jump;
  }, []);

  // Listen for user interactions to track active time and idle timeouts
  useEffect(() => {
    if (!enabled) return;

    const handleInteraction = () => {
      lastInteractionTsRef.current = Date.now();
      isInteractingRef.current = true;
    };

    const events = ["scroll", "touchstart", "touchmove", "mousedown", "keydown"] as const;
    events.forEach((evt) => window.addEventListener(evt, handleInteraction, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleInteraction));
    };
  }, [enabled]);

  // Session lifecycle (start & end)
  useEffect(() => {
    if (!enabled || !documentId) return;

    let isMounted = true;
    startReadingSession(documentId, initialPosition)
      .then((res) => {
        if (isMounted) {
          sessionIdRef.current = res.sessionId;
        } else {
          // If unmounted before start finished, immediately end session
          endReadingSession(res.sessionId, currentPositionRef.current).catch(console.error);
        }
      })
      .catch((err) => {
        console.error("Failed to start reading session:", err);
      });

    return () => {
      isMounted = false;
      const currentSessionId = sessionIdRef.current;
      if (currentSessionId) {
        sessionIdRef.current = null;
        endReadingSession(currentSessionId, currentPositionRef.current).catch(console.error);
      }
    };
  }, [documentId, enabled, initialPosition]);

  // Calculate visible segments in reading zone (vertical 20% - 80% of viewport)
  const calculateVisibleSegments = useCallback((): VisibleSegmentRatio[] => {
    const root = containerRef?.current ?? document.body;
    const segmentEls = root.querySelectorAll<HTMLElement>("[data-segment-index]");
    if (segmentEls.length === 0) return [];

    const winHeight = window.innerHeight;
    const zoneTop = winHeight * 0.2;
    const zoneBottom = winHeight * 0.8;
    const zoneHeight = zoneBottom - zoneTop;

    const visible: VisibleSegmentRatio[] = [];

    segmentEls.forEach((el) => {
      const idxAttr = el.getAttribute("data-segment-index");
      if (!idxAttr) return;
      const segIndex = parseInt(idxAttr, 10);
      if (Number.isNaN(segIndex)) return;

      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;

      const overlapTop = Math.max(rect.top, zoneTop);
      const overlapBottom = Math.min(rect.bottom, zoneBottom);
      const overlapHeight = Math.max(0, overlapBottom - overlapTop);

      if (overlapHeight <= 0) return;

      // Ratio calculation per spec:
      // if rect is smaller or equal to zone: overlap / rect.height
      // if rect is larger than zone: overlap / zoneHeight
      let ratio = 0;
      if (rect.height <= zoneHeight) {
        ratio = overlapHeight / rect.height;
      } else {
        ratio = overlapHeight / zoneHeight;
      }

      // Segment qualifies as visible if ratio >= 0.5 in zone, or covers zone >= 0.6 if larger
      if (ratio >= 0.5 || (rect.height > zoneHeight && ratio >= 0.6)) {
        visible.push({
          segmentIndex: segIndex,
          ratio: Math.min(1.0, Math.max(0.0, ratio)),
        });
      }
    });

    return visible;
  }, [containerRef]);

  // Periodic report dispatcher (throttled to 1s)
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      const now = Date.now();
      if (now - lastReportTsRef.current < 1000) return;

      const isForeground = document.visibilityState === "visible";
      const interacting = isInteractingRef.current || now - lastInteractionTsRef.current <= 1500;
      isInteractingRef.current = false; // Reset burst flag

      const visible = calculateVisibleSegments();
      const jump = pendingJumpRef.current;
      pendingJumpRef.current = "none"; // Consume jump

      const report: ViewportReport = {
        sessionId,
        ts: now,
        visible,
        position: currentPositionRef.current,
        interacting,
        foreground: isForeground,
        jump,
      };

      lastReportTsRef.current = now;
      reportViewport(report).catch((err) => {
        console.error("Failed to report viewport:", err);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateVisibleSegments, enabled]);

  return {
    sessionId: sessionIdRef.current,
    updatePosition,
    setJump,
  };
}
