export type FileType = "pdf" | "docx" | "rtf" | "txt" | "md" | "epub";
export type SegmentStatus = "unread" | "reading" | "read" | "skipped";
export type ParseStatus = "pending" | "parsing" | "ready" | "failed";

export type AppErrorCode =
  | "DocumentNotFound"
  | "UnsupportedFormat"
  | "DuplicateDocument"
  | "InvalidDocument"
  | "ParseFailed"
  | "DatabaseError"
  | "ExportFailed"
  | "PermissionDenied"
  | "StorageUnavailable"
  | "InvalidInput"
  | "NotFound"
  | "Internal";

export interface AppErrorDto {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface LogicalPosition {
  documentId: string;
  sectionId?: number;
  blockId?: string;
  offset?: number;
  page?: number;
  pageOffset?: number;
  percentage: number;
  parserVersion: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  author?: string;
  fileType: FileType;
  fileSize: number;
  pageCount?: number;
  wordCount?: number;
  sectionCount: number;
  progress: number;
  completed: boolean;
  isArchived: boolean;
  createdAt: number;
  lastOpenedAt?: number;
  thumbnailUrl?: string;
  parseStatus: ParseStatus;
}

export interface DocumentDetail extends DocumentSummary {
  originalFilename: string;
  mimeType: string;
  contentHash: string;
  totalReadMs: number;
  sessionCount: number;
  lastReadAt?: number;
  position?: LogicalPosition;
}

export * from "./document";
export * from "./settings";
export * from "./tracker";
export * from "./annotations";
export * from "./search";
export * from "./export";
export * from "./reminder";
