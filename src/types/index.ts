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

export * from "./zod-helpers";
export * from "./document";
export * from "./settings";
export * from "./tracker";
export * from "./annotations";
export * from "./search";
export * from "./export";
export * from "./reminder";
