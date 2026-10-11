import { invoke } from "@tauri-apps/api/core";
import { safeListen, isTauriEnvironment } from "@/lib/ipc";

export type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

export interface ActionNotification {
  id: number;
  actionId: string;
  extra?: Record<string, unknown>;
}

export async function isPermissionGranted(): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    return await invoke<boolean>("plugin:notification|is_permission_granted");
  } catch {
    return true;
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isTauriEnvironment()) return "granted";
  try {
    return await invoke<PermissionState>("plugin:notification|request_permission");
  } catch {
    return "granted";
  }
}

export async function onAction(
  handler: (notification: ActionNotification) => void
): Promise<() => void> {
  return safeListen<ActionNotification>("plugin:notification:action", (event) => {
    handler(event.payload);
  });
}
