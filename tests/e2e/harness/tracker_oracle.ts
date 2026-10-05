import {
  LogicalPosition,
  ResolvedPosition,
  SegmentStatus,
  ViewportReport,
} from "./contracts";

export interface ReadingSegment {
  index: number;
  sectionIndex: number;
  wordCount: number;
  status: SegmentStatus;
  dwellMs: number;
  readCount: number;
  firstReadAt?: number;
  lastReadAt?: number;
}

export interface ReadingSessionRecord {
  sessionId: string;
  documentId: string;
  startedAt: number;
  endedAt?: number;
  lastHeartbeatAt: number;
  activeSeconds: number;
  durationSeconds: number;
  startPosition: LogicalPosition;
  endPosition?: LogicalPosition;
  segmentsChanged: number;
  discardedAsNoise: boolean;
}

/**
 * Reference Tracker Oracle implementing specification in docs/TRACKER_SPEC.md
 * and docs/DOCUMENT_MODEL.md §4.
 */
export class TrackerOracle {
  public static readonly MAX_WPM = 700;
  public static readonly MIN_DWELL_MS = 1200;
  public static readonly READ_RATIO = 0.5;
  public static readonly IDLE_TIMEOUT_MS = 45_000;
  public static readonly MAX_REPORT_DELTA_MS = 2000;
  public static readonly COMPLETION_THRESHOLD = 0.98;

  /**
   * Computes the required dwell time in milliseconds for a segment of given word count.
   * Spec: expected_ms = word_count / max_wpm * 60_000
   *       required_ms = max(min_dwell_ms, expected_ms * read_ratio)
   */
  public static computeRequiredDwellMs(wordCount: number): number {
    const expectedMs = (wordCount / this.MAX_WPM) * 60_000;
    return Math.round(Math.max(this.MIN_DWELL_MS, expectedMs * this.READ_RATIO));
  }

  /**
   * Processes a single ViewportReport for an active session according to state machine in §6.
   */
  public static processViewportReport(
    segments: ReadingSegment[],
    lastReportTs: number | null,
    report: ViewportReport,
    session: ReadingSessionRecord
  ): { segments: ReadingSegment[]; deltaDwellMs: number } {
    const now = report.ts;
    const deltaMs = lastReportTs
      ? Math.min(this.MAX_REPORT_DELTA_MS, Math.max(0, now - lastReportTs))
      : 1000;

    // Filter segments in reading zone (ratio >= 0.5)
    const visibleSegments = report.visible.filter((v) => v.ratio >= 0.5);

    if (
      report.foreground &&
      (report.interacting || deltaMs <= this.IDLE_TIMEOUT_MS) &&
      visibleSegments.length > 0
    ) {
      const dwellSharePerSegment = Math.round(deltaMs / visibleSegments.length);

      for (const visible of visibleSegments) {
        const seg = segments.find((s) => s.index === visible.segmentIndex);
        if (!seg) continue;

        const reqDwell = this.computeRequiredDwellMs(seg.wordCount);
        seg.dwellMs += dwellSharePerSegment;

        if (seg.dwellMs >= reqDwell) {
          if (seg.status !== "read") {
            seg.status = "read";
            seg.readCount += 1;
            seg.firstReadAt = seg.firstReadAt || now;
            seg.lastReadAt = now;
            session.segmentsChanged += 1;
          }
        } else if (seg.status === "unread") {
          seg.status = "reading";
        }
      }
    }

    // Check for skipped segments on continuous forward scroll
    if (report.jump === "none") {
      const highestVisible = Math.max(...report.visible.map((v) => v.segmentIndex), -1);
      if (highestVisible >= 0) {
        for (const seg of segments) {
          if (seg.index < highestVisible && seg.status === "unread" && seg.dwellMs === 0) {
            seg.status = "skipped";
          }
        }
      }
    }

    session.lastHeartbeatAt = now;
    session.durationSeconds = Math.round((now - session.startedAt) / 1000);
    session.activeSeconds += Math.round(deltaMs / 1000);
    session.endPosition = report.position;

    return { segments, deltaDwellMs: deltaMs };
  }

  /**
   * Computes weighted progress based on segment word counts.
   * Spec: progress_percent = sum(word_count(read)) / sum(word_count(all))
   */
  public static computeProgress(segments: ReadingSegment[]): {
    progress: number;
    completed: boolean;
  } {
    const totalWords = segments.reduce((acc, s) => acc + s.wordCount, 0);
    if (totalWords === 0) {
      return { progress: 0, completed: false };
    }

    const readWords = segments
      .filter((s) => s.status === "read")
      .reduce((acc, s) => acc + s.wordCount, 0);

    const progress = Math.min(1, readWords / totalWords);
    const completed = progress >= this.COMPLETION_THRESHOLD;

    return { progress, completed };
  }

  /**
   * Resolves reading position using the 5-Tier Fallback algorithm from docs/DOCUMENT_MODEL.md §4.
   */
  public static resolvePosition(
    target: LogicalPosition,
    totalDocChars: number,
    availableSections: { index: number; blocks: { id: string; charLength: number; linearPos: number }[] }[]
  ): ResolvedPosition {
    // Tier 4: Document empty
    if (availableSections.length === 0 || totalDocChars === 0) {
      return {
        sectionIndex: 0,
        percentage: 0,
        linearPos: 0,
        fallbackTier: "start",
      };
    }

    // Tier 5: PDF Clamp check
    if (target.page !== undefined) {
      const page = Math.max(1, target.page);
      const pageOffset = Math.max(0, Math.min(1, target.pageOffset ?? 0));
      const linearPos = (page - 1) * 1_000_000 + Math.round(pageOffset * 999_999);
      return {
        sectionIndex: page - 1,
        page,
        pageOffset,
        percentage: target.percentage,
        linearPos,
        fallbackTier: "clamped",
      };
    }

    const section = availableSections.find((s) => s.index === target.sectionId);

    // Tier 1: Same parser version, exact block match
    if (section && target.blockId) {
      const block = section.blocks.find((b) => b.id === target.blockId);
      if (block) {
        const offset = Math.min(target.offset ?? 0, block.charLength);
        return {
          sectionIndex: section.index,
          blockId: block.id,
          offset,
          percentage: target.percentage,
          linearPos: block.linearPos + offset,
          fallbackTier: "exact",
        };
      }

      // Tier 2: Block not found, find closest block in same section
      if (section.blocks.length > 0) {
        const targetLinear = Math.round(target.percentage * totalDocChars);
        let closest = section.blocks[0];
        let minDiff = Math.abs(closest.linearPos - targetLinear);

        for (const blk of section.blocks) {
          const diff = Math.abs(blk.linearPos - targetLinear);
          if (diff < minDiff) {
            minDiff = diff;
            closest = blk;
          }
        }

        return {
          sectionIndex: section.index,
          blockId: closest.id,
          offset: 0,
          percentage: target.percentage,
          linearPos: closest.linearPos,
          fallbackTier: "linear_proximity",
        };
      }
    }

    // Tier 3: Section not found, use percentage -> closest block in document
    const allBlocks = availableSections.flatMap((s) =>
      s.blocks.map((b) => ({ ...b, sectionIndex: s.index }))
    );

    if (allBlocks.length > 0) {
      const targetLinear = Math.round(target.percentage * totalDocChars);
      let closest = allBlocks[0];
      let minDiff = Math.abs(closest.linearPos - targetLinear);

      for (const blk of allBlocks) {
        const diff = Math.abs(blk.linearPos - targetLinear);
        if (diff < minDiff) {
          minDiff = diff;
          closest = blk;
        }
      }

      return {
        sectionIndex: closest.sectionIndex,
        blockId: closest.id,
        offset: 0,
        percentage: target.percentage,
        linearPos: closest.linearPos,
        fallbackTier: "percentage",
      };
    }

    return {
      sectionIndex: 0,
      percentage: 0,
      linearPos: 0,
      fallbackTier: "start",
    };
  }

  /**
   * Finalizes session and applies noise filtering (§8: active < 5s & 0 segments changed -> discarded).
   */
  public static endSession(session: ReadingSessionRecord, endTs: number): ReadingSessionRecord | null {
    session.endedAt = endTs;
    session.durationSeconds = Math.round((endTs - session.startedAt) / 1000);

    if (session.activeSeconds < 5 && session.segmentsChanged === 0) {
      session.discardedAsNoise = true;
      return null;
    }

    return session;
  }
}
