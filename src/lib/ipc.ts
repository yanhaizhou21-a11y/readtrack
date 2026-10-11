import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as tauriListen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { z, type ZodType } from "zod";
import type { AppErrorDto, AppErrorCode } from "@/types";

export const AppErrorCodeSchema = z.enum([
  "DocumentNotFound",
  "UnsupportedFormat",
  "DuplicateDocument",
  "InvalidDocument",
  "ParseFailed",
  "DatabaseError",
  "ExportFailed",
  "PermissionDenied",
  "StorageUnavailable",
  "InvalidInput",
  "NotFound",
  "Internal",
]);

export const AppErrorDtoSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean(),
});

export class IpcException extends Error implements AppErrorDto {
  code: AppErrorCode;
  details?: Record<string, unknown>;
  retryable: boolean;

  constructor(error: AppErrorDto) {
    super(error.message);
    this.name = "IpcException";
    this.code = error.code;
    this.details = error.details;
    this.retryable = error.retryable;
    Object.setPrototypeOf(this, IpcException.prototype);
  }
}

export function parseIpcError(error: unknown): AppErrorDto {
  if (typeof error === "object" && error !== null) {
    const parsed = AppErrorDtoSchema.safeParse(error);
    if (parsed.success) {
      return parsed.data;
    }

    const maybeRecord = error as Record<string, unknown>;
    if (typeof maybeRecord.message === "string") {
      return {
        code: "Internal",
        message: maybeRecord.message,
        retryable: false,
      };
    }
  }

  if (typeof error === "string") {
    return {
      code: "Internal",
      message: error,
      retryable: false,
    };
  }

  return {
    code: "Internal",
    message: "An unexpected error occurred.",
    retryable: true,
  };
}

export async function ipc<T>(
  command: string,
  args: Record<string, unknown> = {},
  schema?: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await tauriInvoke(command, args);
  } catch (err: unknown) {
    throw new IpcException(parseIpcError(err));
  }

  if (schema) {
    const parseResult = schema.safeParse(raw);
    if (!parseResult.success) {
      console.error(`[IPC] Validation failed for command ${command}:`, parseResult.error);
      throw new IpcException({
        code: "InvalidInput",
        message: "Invalid response format from application backend.",
        details: { issues: parseResult.error.issues },
        retryable: false,
      });
    }
    return parseResult.data;
  }

  return raw as T;
}

export function isTauriEnvironment(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (typeof isTauri === "function") {
      return isTauri();
    }
    return "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

export async function safeListen<T>(
  event: string,
  handler: EventCallback<T>
): Promise<UnlistenFn> {
  if (!isTauriEnvironment()) {
    return () => {};
  }
  try {
    return await tauriListen<T>(event, handler);
  } catch (err: unknown) {
    console.warn(`[IPC] Failed to listen to event "${event}":`, err);
    return () => {};
  }
}

