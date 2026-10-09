import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
  try {
    return await invoke<boolean>("plugin:notification|is_permission_granted");
  } catch {
    return true;
  }
}

export async function requestPermission(): Promise<PermissionState> {
  try {
    return await invoke<PermissionState>("plugin:notification|request_permission");
  } catch {
    return "granted";
  }
}

export async function onAction(
  handler: (notification: ActionNotification) => void
): Promise<() => void> {
  try {
    return await listen<ActionNotification>("plugin:notification:action", (event) => {
      handler(event.payload);
    });
  } catch {
    return () => {};
  }
}
