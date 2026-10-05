import { z } from "zod";
import { LogicalPositionSchema, DocumentSummarySchema } from "./document";

export const SegmentStatusSchema = z.enum(["unread", "reading", "read", "skipped"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const VisibleSegmentRatioSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1),
});
export type VisibleSegmentRatio = z.infer<typeof VisibleSegmentRatioSchema>;

export const JumpTypeSchema = z.enum(["none", "toc", "search", "bookmark", "resume", "slider"]);
export type JumpType = z.infer<typeof JumpTypeSchema>;

export const ViewportReportSchema = z.object({
  sessionId: z.string().uuid(),
  ts: z.number().int().positive(),
  visible: z.array(VisibleSegmentRatioSchema),
  position: LogicalPositionSchema,
  interacting: z.boolean(),
  foreground: z.boolean(),
  jump: JumpTypeSchema,
});
export type ViewportReport = z.infer<typeof ViewportReportSchema>;

export const ReadingSessionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive().nullable().optional(),
  lastHeartbeatAt: z.number().int().positive(),
  durationSeconds: z.number().int().nonnegative(),
  activeSeconds: z.number().int().nonnegative(),
  startPosition: LogicalPositionSchema.nullable().optional(),
  endPosition: LogicalPositionSchema.nullable().optional(),
  startPos: z.number().int().nonnegative(),
  endPos: z.number().int().nonnegative(),
  pagesRead: z.number().int().nonnegative(),
  segmentsRead: z.number().int().nonnegative(),
});
export type ReadingSession = z.infer<typeof ReadingSessionSchema>;

export const SessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  documentId: z.string().uuid(),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  durationSeconds: z.number().int().nonnegative(),
  activeSeconds: z.number().int().nonnegative(),
  pagesRead: z.number().int().nonnegative(),
  segmentsRead: z.number().int().nonnegative(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const MapSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  status: SegmentStatusSchema,
  wordCount: z.number().int().nonnegative(),
});
export type MapSegment = z.infer<typeof MapSegmentSchema>;

export const MapSectionSchema = z.object({
  sectionId: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string(),
  progress: z.number().min(0).max(1),
  status: z.enum(["unread", "reading", "read"]),
  lastReadAt: z.number().int().positive().nullable().optional(),
  readMs: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  segments: z.array(MapSegmentSchema),
  startPos: LogicalPositionSchema,
});
export type MapSection = z.infer<typeof MapSectionSchema>;

export const ReadingMapSchema = z.object({
  documentId: z.string().uuid(),
  progress: z.number().min(0).max(1),
  completed: z.boolean(),
  totalReadMs: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  lastReadAt: z.number().int().positive().nullable().optional(),
  sections: z.array(MapSectionSchema),
  current: LogicalPositionSchema,
});
export type ReadingMap = z.infer<typeof ReadingMapSchema>;

export const DayActivitySchema = z.object({
  date: z.string(),
  ms: z.number().int().nonnegative(),
});
export type DayActivity = z.infer<typeof DayActivitySchema>;

export const TrackerOverviewSchema = z.object({
  todayMs: z.number().int().nonnegative(),
  weekMs: z.number().int().nonnegative(),
  documents: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  currentlyReading: z.array(DocumentSummarySchema),
  activityByDay: z.array(DayActivitySchema),
});
export type TrackerOverview = z.infer<typeof TrackerOverviewSchema>;

export const ContinueCardSchema = z.object({
  document: DocumentSummarySchema,
  sectionTitle: z.string().nullable().optional(),
  progress: z.number().min(0).max(1),
  position: LogicalPositionSchema,
});
export type ContinueCard = z.infer<typeof ContinueCardSchema>;

export const HomeDashboardSchema = z.object({
  continueReading: ContinueCardSchema.nullable().optional(),
  recent: z.array(DocumentSummarySchema),
  currentlyReading: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  activity: z.array(DayActivitySchema),
});
export type HomeDashboard = z.infer<typeof HomeDashboardSchema>;

export const ReadingProgressUpdatedPayloadSchema = z.object({
  documentId: z.string().uuid(),
  progress: z.number().min(0).max(1),
  currentSectionId: z.string().nullable().optional(),
  completed: z.boolean(),
});
export type ReadingProgressUpdatedPayload = z.infer<typeof ReadingProgressUpdatedPayloadSchema>;
