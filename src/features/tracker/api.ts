import { z } from "zod";
import { ipc } from "@/lib/ipc";
import {
  HomeDashboard,
  HomeDashboardSchema,
  LogicalPosition,
  ReadingMap,
  ReadingMapSchema,
  ReadingSession,
  ReadingSessionSchema,
  SessionSummary,
  SessionSummarySchema,
  TrackerOverview,
  TrackerOverviewSchema,
  ViewportReport,
} from "@/types";
import { ReadingProgress, ReadingProgressSchema } from "@/features/reader/api";

const StartSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function startReadingSession(
  documentId: string,
  position: LogicalPosition
): Promise<{ sessionId: string }> {
  return ipc(
    "reading_start_session",
    { input: { documentId, position } },
    StartSessionResponseSchema
  );
}

export async function reportViewport(report: ViewportReport): Promise<void> {
  await ipc("reading_report_viewport", { input: report });
}

export async function endReadingSession(
  sessionId: string,
  position: LogicalPosition
): Promise<SessionSummary | null> {
  return ipc(
    "reading_end_session",
    { input: { sessionId, position } },
    SessionSummarySchema.nullable()
  );
}

export async function getReadingSessions(params?: {
  documentId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}): Promise<ReadingSession[]> {
  return ipc(
    "reading_get_sessions",
    {
      input: {
        documentId: params?.documentId,
        from: params?.from,
        to: params?.to,
        limit: params?.limit,
        offset: params?.offset,
      },
    },
    z.array(ReadingSessionSchema)
  );
}

export async function getReadingMap(documentId: string): Promise<ReadingMap> {
  return ipc(
    "tracker_get_map",
    { input: { documentId } },
    ReadingMapSchema
  );
}

export async function getTrackerOverview(
  now: number = Date.now(),
  tzOffsetMin: number = -new Date().getTimezoneOffset()
): Promise<TrackerOverview> {
  return ipc(
    "tracker_get_overview",
    { input: { now, tzOffsetMin } },
    TrackerOverviewSchema
  );
}

export async function getHomeDashboard(
  now: number = Date.now(),
  tzOffsetMin: number = -new Date().getTimezoneOffset()
): Promise<HomeDashboard> {
  return ipc(
    "home_get_dashboard",
    { input: { now, tzOffsetMin } },
    HomeDashboardSchema
  );
}

export async function markDocumentCompleted(
  documentId: string
): Promise<ReadingProgress> {
  return ipc(
    "reading_mark_completed",
    { input: { documentId } },
    ReadingProgressSchema
  );
}

export async function markDocumentUnread(
  documentId: string
): Promise<ReadingProgress> {
  return ipc(
    "reading_mark_unread",
    { input: { documentId } },
    ReadingProgressSchema
  );
}
