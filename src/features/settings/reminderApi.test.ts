import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reminderList,
  reminderGet,
  reminderUpsert,
  reminderDelete,
  reminderSyncNotifications,
  reminderTestNotify,
  checkNotificationPermission,
  requestNotificationPermission,
} from "./reminderApi";
import { ipc } from "@/lib/ipc";
import * as notificationLib from "@/lib/notification";
import type { Reminder, ReminderUpsertInput, NotificationPayload } from "@/types";

vi.mock("@/lib/ipc");
vi.mock("@/lib/notification");

const mockReminder: Reminder = {
  id: "rem-1",
  documentId: null,
  enabled: true,
  scheduleType: "daily",
  timeOfDayMin: 1200,
  daysOfWeek: null,
  scheduledAt: null,
  repeatInterval: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe("reminderApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reminderList calls ipc with reminder_list command", async () => {
    vi.mocked(ipc).mockResolvedValueOnce([mockReminder]);

    const result = await reminderList();
    expect(ipc).toHaveBeenCalledWith("reminder_list", {}, expect.anything());
    expect(result).toEqual([mockReminder]);
  });

  it("reminderGet calls ipc with reminder_get command", async () => {
    vi.mocked(ipc).mockResolvedValueOnce(mockReminder);

    const result = await reminderGet("rem-1");
    expect(ipc).toHaveBeenCalledWith(
      "reminder_get",
      { input: { id: "rem-1" } },
      expect.anything()
    );
    expect(result).toEqual(mockReminder);
  });

  it("reminderUpsert passes input correctly", async () => {
    const input: ReminderUpsertInput = {
      id: "rem-1",
      documentId: null,
      enabled: true,
      scheduleType: "daily",
      timeOfDayMin: 1200,
    };
    vi.mocked(ipc).mockResolvedValueOnce(mockReminder);

    const result = await reminderUpsert(input);
    expect(ipc).toHaveBeenCalledWith("reminder_upsert", { input }, expect.anything());
    expect(result).toEqual(mockReminder);
  });

  it("reminderDelete calls ipc with reminder_delete", async () => {
    vi.mocked(ipc).mockResolvedValueOnce(undefined);

    await reminderDelete("rem-1");
    expect(ipc).toHaveBeenCalledWith("reminder_delete", { input: { id: "rem-1" } });
  });

  it("reminderSyncNotifications calls ipc with reminder_sync_notifications", async () => {
    vi.mocked(ipc).mockResolvedValueOnce(undefined);

    await reminderSyncNotifications();
    expect(ipc).toHaveBeenCalledWith("reminder_sync_notifications", {});
  });

  it("reminderTestNotify calls ipc with reminder_test_notify", async () => {
    const payload: NotificationPayload = {
      title: "Continue reading",
      body: "Chapter 1 · 10% completed. Tap to resume.",
      documentId: "doc-1",
      position: null,
    };
    vi.mocked(ipc).mockResolvedValueOnce(payload);

    const result = await reminderTestNotify("rem-1");
    expect(ipc).toHaveBeenCalledWith(
      "reminder_test_notify",
      { input: { id: "rem-1" } },
      expect.anything()
    );
    expect(result).toEqual(payload);
  });

  it("checkNotificationPermission delegates to notification library", async () => {
    vi.spyOn(notificationLib, "isPermissionGranted").mockResolvedValueOnce(true);

    const granted = await checkNotificationPermission();
    expect(granted).toBe(true);
  });

  it("requestNotificationPermission returns boolean", async () => {
    vi.spyOn(notificationLib, "requestPermission").mockResolvedValueOnce("granted");

    const granted = await requestNotificationPermission();
    expect(granted).toBe(true);
  });
});
