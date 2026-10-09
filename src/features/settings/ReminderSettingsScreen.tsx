import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Clock,
  ShieldCheck,
  Trash2,
  Check,
  BookOpen,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  reminderList,
  reminderUpsert,
  reminderDelete,
  reminderTestNotify,
  checkNotificationPermission,
  requestNotificationPermission,
} from "./reminderApi";
import { listDocuments } from "@/features/library/api/documents";
import type { Reminder, ReminderScheduleType, DocumentSummary } from "@/types";

const DAYS_MAP = [
  { bit: 1, label: "Mon", full: "Monday" },
  { bit: 2, label: "Tue", full: "Tuesday" },
  { bit: 4, label: "Wed", full: "Wednesday" },
  { bit: 8, label: "Thu", full: "Thursday" },
  { bit: 16, label: "Fri", full: "Friday" },
  { bit: 32, label: "Sat", full: "Saturday" },
  { bit: 64, label: "Sun", full: "Sunday" },
];

function minToTimeString(min: number | null): string {
  if (min === null || min === undefined) return "20:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function timeStringToMin(str: string): number {
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const ReminderSettingsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [documents, setDocuments] = useState<Record<string, DocumentSummary>>({});

  // Habit reminder state
  const [habitEnabled, setHabitEnabled] = useState(false);
  const [habitScheduleType, setHabitScheduleType] = useState<ReminderScheduleType>("daily");
  const [habitTimeStr, setHabitTimeStr] = useState("20:00");
  const [habitDaysMask, setHabitDaysMask] = useState<number>(31); // Mon-Fri default (1+2+4+8+16)
  const [habitId, setHabitId] = useState<string | undefined>(undefined);

  // Status feedback
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, docRes] = await Promise.all([
        reminderList(),
        listDocuments().catch(() => ({ items: [], total: 0 })),
      ]);

      setReminders(list);

      const docMap: Record<string, DocumentSummary> = {};
      for (const d of docRes.items) {
        docMap[d.id] = d;
      }
      setDocuments(docMap);

      const habit = list.find((r) => r.documentId === null);
      if (habit) {
        setHabitId(habit.id);
        setHabitEnabled(habit.enabled);
        setHabitScheduleType(habit.scheduleType);
        setHabitTimeStr(minToTimeString(habit.timeOfDayMin));
        setHabitDaysMask(habit.daysOfWeek ?? 31);
      } else {
        setHabitId(undefined);
        setHabitEnabled(false);
        setHabitScheduleType("daily");
        setHabitTimeStr("20:00");
        setHabitDaysMask(31);
      }
    } catch (err: unknown) {
      console.error("Failed to load reminders:", err);
      setError(err instanceof Error ? err.message : "Failed to load reminder settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveHabitReminder = async (
    enabled: boolean,
    scheduleType: ReminderScheduleType,
    timeStr: string,
    daysMask: number
  ) => {
    try {
      setSavingStatus("Saving...");
      if (enabled) {
        const hasPermission = await checkNotificationPermission();
        if (!hasPermission) {
          const granted = await requestNotificationPermission();
          if (!granted) {
            setTestStatus("Notification permissions are required on this device.");
          }
        }
      }

      const saved = await reminderUpsert({
        id: habitId,
        documentId: null,
        enabled,
        scheduleType,
        timeOfDayMin: timeStringToMin(timeStr),
        daysOfWeek: scheduleType === "custom" ? daysMask : null,
      });

      setHabitId(saved.id);
      setSavingStatus("Saved");
      setTimeout(() => setSavingStatus(null), 2000);
      setReminders((prev) => {
        const filtered = prev.filter((r) => r.id !== saved.id);
        return [...filtered, saved];
      });
    } catch (err: unknown) {
      console.error("Failed to save habit reminder:", err);
      setSavingStatus("Save failed");
      setTimeout(() => setSavingStatus(null), 3000);
    }
  };

  const handleToggleHabit = (checked: boolean) => {
    setHabitEnabled(checked);
    saveHabitReminder(checked, habitScheduleType, habitTimeStr, habitDaysMask);
  };

  const handleScheduleTypeChange = (type: ReminderScheduleType) => {
    setHabitScheduleType(type);
    saveHabitReminder(habitEnabled, type, habitTimeStr, habitDaysMask);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHabitTimeStr(val);
    saveHabitReminder(habitEnabled, habitScheduleType, val, habitDaysMask);
  };

  const handleToggleDay = (bit: number) => {
    const nextMask = habitDaysMask ^ bit;
    if (nextMask === 0) return; // Keep at least one day selected
    setHabitDaysMask(nextMask);
    saveHabitReminder(habitEnabled, habitScheduleType, habitTimeStr, nextMask);
  };

  const handleTestNotification = async () => {
    try {
      setTestStatus("Sending test notification...");
      const hasPermission = await checkNotificationPermission();
      if (!hasPermission) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setTestStatus("Permission was not granted. Please enable notifications in device settings.");
          return;
        }
      }

      await reminderTestNotify(habitId);
      setTestStatus("Test notification sent. Check your notification center.");
      setTimeout(() => setTestStatus(null), 4000);
    } catch (err: unknown) {
      console.error("Test notification error:", err);
      setTestStatus("Could not send notification. Please check system permissions.");
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  const handleDeleteBookReminder = async (id: string) => {
    try {
      await reminderDelete(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete reminder:", err);
    }
  };

  const handleToggleBookReminder = async (reminder: Reminder) => {
    try {
      const updated = await reminderUpsert({
        id: reminder.id,
        documentId: reminder.documentId,
        enabled: !reminder.enabled,
        scheduleType: reminder.scheduleType,
        timeOfDayMin: reminder.timeOfDayMin,
        daysOfWeek: reminder.daysOfWeek,
        scheduledAt: reminder.scheduledAt,
      });
      setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      console.error("Failed to update reminder:", err);
    }
  };

  const bookReminders = reminders.filter((r) => r.documentId !== null);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Reading Reminders" showBack />

      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
        {loading ? (
          <div className="space-y-4">
            <LoadingSkeleton count={3} className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title="Unable to load reminders"
            message={error}
            actions={[{ label: "Retry", onClick: loadData }]}
          />
        ) : (
          <>
            {/* Offline and Privacy Card */}
            <div className="bg-surface rounded-card p-4 border border-border flex items-start gap-3">
              <div className="p-2 rounded-control bg-accent/10 text-accent shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">
                  Offline and Private
                </h2>
                <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                  Reminders are scheduled and triggered entirely on this device.
                  No internet connection or account is required.
                </p>
              </div>
            </div>

            {/* Daily Habit Schedule Card */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4 text-accent" />
                    <span>Habit Reminder</span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Reminds you to continue your active book
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={habitEnabled}
                  aria-label="Toggle habit reminder"
                  onClick={() => handleToggleHabit(!habitEnabled)}
                  className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors min-h-[44px] justify-center ${
                    habitEnabled ? "bg-accent" : "bg-surface-3"
                  }`}
                >
                  <div
                    className={`bg-surface w-5 h-5 rounded-full shadow-sm transform transition-transform ${
                      habitEnabled ? "translate-x-2.5" : "-translate-x-2.5"
                    }`}
                  />
                </button>
              </div>

              {habitEnabled && (
                <div className="space-y-4 pt-3 border-t border-border/50">
                  {/* Schedule Selector */}
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-2">
                      Frequency
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["daily", "weekdays", "custom"] as ReminderScheduleType[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleScheduleTypeChange(st)}
                          className={`min-h-[44px] h-11 rounded-control text-xs font-medium capitalize border transition-all ${
                            habitScheduleType === st
                              ? "bg-accent text-accent-foreground border-accent"
                              : "border-border text-foreground hover:bg-surface-2"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Days Picker */}
                  {habitScheduleType === "custom" && (
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-2">
                        Active Days
                      </label>
                      <div className="grid grid-cols-7 gap-1">
                        {DAYS_MAP.map((d) => {
                          const isSelected = (habitDaysMask & d.bit) !== 0;
                          return (
                            <button
                              key={d.bit}
                              type="button"
                              onClick={() => handleToggleDay(d.bit)}
                              aria-label={d.full}
                              title={d.full}
                              className={`min-h-[44px] h-11 rounded-control text-[11px] font-medium border flex items-center justify-center transition-all ${
                                isSelected
                                  ? "bg-accent text-accent-foreground border-accent font-bold"
                                  : "border-border text-foreground hover:bg-surface-2"
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Time Input */}
                  <div>
                    <label
                      htmlFor="habit-time-input"
                      className="text-xs font-medium text-foreground block mb-2"
                    >
                      Reminder Time
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          id="habit-time-input"
                          type="time"
                          value={habitTimeStr}
                          onChange={handleTimeChange}
                          className="w-full min-h-[44px] h-11 px-3 bg-surface-2 border border-border rounded-control text-sm text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted px-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Daily trigger</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary note */}
                  <div className="p-3 bg-surface-2 rounded-control text-xs text-muted leading-relaxed">
                    {habitScheduleType === "daily" &&
                      `Sends a calm notification every day at ${habitTimeStr} with your current chapter.`}
                    {habitScheduleType === "weekdays" &&
                      `Sends a calm notification Monday through Friday at ${habitTimeStr}.`}
                    {habitScheduleType === "custom" &&
                      `Sends a calm notification on selected days at ${habitTimeStr}.`}
                  </div>
                </div>
              )}

              {savingStatus && (
                <div className="text-xs text-muted font-mono flex items-center gap-1.5 pt-1">
                  <Check className="w-3.5 h-3.5 text-accent" />
                  <span>{savingStatus}</span>
                </div>
              )}
            </section>

            {/* Test Notification Action */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-3">
              <div>
                <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">
                  Test Delivery
                </h2>
                <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                  Verify notification delivery and test the deep link into your reader.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestNotification}
                className="w-full min-h-[44px] h-11 px-4 border border-border bg-surface-2 text-foreground font-mono text-xs font-bold uppercase tracking-wide hover:bg-surface-3 transition-colors flex items-center justify-between"
              >
                <span>Send Test Notification</span>
                <span className="text-accent text-[11px] font-sans">Trigger &rarr;</span>
              </button>

              {testStatus && (
                <div className="p-3 bg-surface-2 border border-border rounded-control text-xs text-foreground leading-relaxed">
                  {testStatus}
                </div>
              )}
            </section>

            {/* Book-Specific Reminders */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-4">
              <div>
                <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">
                  Book Specific Reminders
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Dedicated alerts configured for specific volumes
                </p>
              </div>

              {bookReminders.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-control text-center space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    No book specific reminders configured
                  </p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Habit reminders automatically keep track of your active books. You can also configure reminders on individual book detail screens.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookReminders.map((r) => {
                    const doc = r.documentId ? documents[r.documentId] : null;
                    const title = doc?.title || "Document reminder";
                    return (
                      <div
                        key={r.id}
                        className="p-3 bg-surface-2 rounded-control border border-border/80 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                            <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="truncate">{title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                            <span className="capitalize">{r.scheduleType}</span>
                            <span>&middot;</span>
                            <span>{minToTimeString(r.timeOfDayMin)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={r.enabled}
                            aria-label={`Toggle reminder for ${title}`}
                            onClick={() => handleToggleBookReminder(r)}
                            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-control transition-colors ${
                              r.enabled
                                ? "text-accent bg-accent/10"
                                : "text-muted hover:bg-surface-3"
                            }`}
                          >
                            <Bell className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            aria-label={`Delete reminder for ${title}`}
                            onClick={() => handleDeleteBookReminder(r.id)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-control text-danger hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};
