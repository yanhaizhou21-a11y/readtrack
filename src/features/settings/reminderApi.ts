import { ipc } from "@/lib/ipc";
import { z } from "zod";
import {
  Reminder,
  ReminderSchema,
  ReminderUpsertInput,
  NotificationPayload,
  NotificationPayloadSchema,
} from "@/types";
import {
  isPermissionGranted,
  requestPermission,
} from "@/lib/notification";

export async function reminderList(): Promise<Reminder[]> {
  return ipc("reminder_list", {}, z.array(ReminderSchema));
}

export async function reminderGet(id: string): Promise<Reminder | null> {
  return ipc("reminder_get", { input: { id } }, ReminderSchema.nullable());
}

export async function reminderUpsert(input: ReminderUpsertInput): Promise<Reminder> {
  return ipc("reminder_upsert", { input }, ReminderSchema);
}

export async function reminderDelete(id: string): Promise<void> {
  await ipc<void>("reminder_delete", { input: { id } });
}

export async function reminderSyncNotifications(): Promise<void> {
  await ipc<void>("reminder_sync_notifications", {});
}

export async function reminderTestNotify(id?: string): Promise<NotificationPayload> {
  return ipc(
    "reminder_test_notify",
    { input: { id: id ?? null } },
    NotificationPayloadSchema
  );
}

export async function checkNotificationPermission(): Promise<boolean> {
  try {
    return await isPermissionGranted();
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const permission = await requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}
