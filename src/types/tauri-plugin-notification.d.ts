declare module "@tauri-apps/plugin-notification" {
  export type PermissionState =
    | "granted"
    | "denied"
    | "prompt"
    | "prompt-with-rationale";

  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<PermissionState>;

  export interface NotificationOptions {
    title: string;
    body?: string;
    extra?: Record<string, unknown>;
  }

  export function sendNotification(options: NotificationOptions | string): void;

  export function onAction(
    handler: (notification: {
      id: number;
      actionId: string;
      extra?: Record<string, unknown>;
    }) => void
  ): Promise<() => void>;
}
