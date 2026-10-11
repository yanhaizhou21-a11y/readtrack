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
import { triggerHaptic } from "@/lib/haptic";
import { useTranslation, type TranslationKey } from "@/i18n";
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

const DAYS_CONFIG: { bit: number; labelKey: TranslationKey; fullKey: TranslationKey }[] = [
  { bit: 1, labelKey: "days.mon", fullKey: "days.monday" },
  { bit: 2, labelKey: "days.tue", fullKey: "days.tuesday" },
  { bit: 4, labelKey: "days.wed", fullKey: "days.wednesday" },
  { bit: 8, labelKey: "days.thu", fullKey: "days.thursday" },
  { bit: 16, labelKey: "days.fri", fullKey: "days.friday" },
  { bit: 32, labelKey: "days.sat", fullKey: "days.saturday" },
  { bit: 64, labelKey: "days.sun", fullKey: "days.sunday" },
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
  const { t } = useTranslation();
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
      setSavingStatus(t("reminder.saving"));
      if (enabled) {
        const hasPermission = await checkNotificationPermission();
        if (!hasPermission) {
          const granted = await requestNotificationPermission();
          if (!granted) {
            setTestStatus(t("reminder.permReq"));
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

      triggerHaptic("tick");
      setHabitId(saved.id);
      setSavingStatus(t("reminder.saved"));
      setTimeout(() => setSavingStatus(null), 2000);
      setReminders((prev) => {
        const filtered = prev.filter((r) => r.id !== saved.id);
        return [...filtered, saved];
      });
    } catch (err: unknown) {
      console.error("Failed to save habit reminder:", err);
      setSavingStatus(t("reminder.saveFailed"));
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
      setTestStatus(t("reminder.sendingTest"));
      const hasPermission = await checkNotificationPermission();
      if (!hasPermission) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setTestStatus(t("reminder.permDenied"));
          return;
        }
      }

      await reminderTestNotify(habitId);
      setTestStatus(t("reminder.testSent"));
      setTimeout(() => setTestStatus(null), 4000);
    } catch (err: unknown) {
      console.error("Test notification error:", err);
      setTestStatus(t("reminder.testFailed"));
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
      <Header title={t("reminder.screenTitle")} showBack />

      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
        {loading ? (
          <div className="space-y-4">
            <LoadingSkeleton count={3} className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={t("reminder.unableToLoad")}
            message={error}
            actions={[{ label: t("common.retry"), onClick: loadData }]}
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
                  {t("reminder.offlinePrivate")}
                </h2>
                <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                  {t("reminder.offlinePrivateDesc")}
                </p>
              </div>
            </div>

            {/* Daily Habit Schedule Card */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4 text-accent" />
                    <span>{t("reminder.habitReminder")}</span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {t("reminder.habitSubtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={habitEnabled}
                  aria-label={t("reminder.toggleHabit")}
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
                      {t("reminder.frequency")}
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
                          {st === "daily"
                            ? t("reminder.daily")
                            : st === "weekdays"
                            ? t("reminder.weekdays")
                            : t("reminder.custom")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Days Picker */}
                  {habitScheduleType === "custom" && (
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-2">
                        {t("reminder.activeDays")}
                      </label>
                      <div className="grid grid-cols-7 gap-1">
                        {DAYS_CONFIG.map((d) => {
                          const isSelected = (habitDaysMask & d.bit) !== 0;
                          return (
                            <button
                              key={d.bit}
                              type="button"
                              onClick={() => handleToggleDay(d.bit)}
                              aria-label={t(d.fullKey)}
                              title={t(d.fullKey)}
                              className={`min-h-[44px] h-11 rounded-control text-[11px] font-medium border flex items-center justify-center transition-all ${
                                isSelected
                                  ? "bg-accent text-accent-foreground border-accent font-bold"
                                  : "border-border text-foreground hover:bg-surface-2"
                              }`}
                            >
                              {t(d.labelKey)}
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
                      {t("reminder.reminderTime")}
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
                        <span>{t("reminder.dailyTrigger")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary note */}
                  <div className="p-3 bg-surface-2 rounded-control text-xs text-muted leading-relaxed">
                    {habitScheduleType === "daily" &&
                      t("reminder.summaryDaily", { time: habitTimeStr })}
                    {habitScheduleType === "weekdays" &&
                      t("reminder.summaryWeekdays", { time: habitTimeStr })}
                    {habitScheduleType === "custom" &&
                      t("reminder.summaryCustom", { time: habitTimeStr })}
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
                  {t("reminder.testDelivery")}
                </h2>
                <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                  {t("reminder.testDeliveryDesc")}
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestNotification}
                className="w-full min-h-[44px] h-11 px-4 border border-border bg-surface-2 text-foreground font-mono text-xs font-bold uppercase tracking-wide hover:bg-surface-3 transition-colors flex items-center justify-between"
              >
                <span>{t("reminder.sendTestBtn")}</span>
                <span className="text-accent text-[11px] font-sans">{t("reminder.triggerAction")}</span>
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
                  {t("reminder.bookReminders")}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {t("reminder.bookRemindersDesc")}
                </p>
              </div>

              {bookReminders.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-control text-center space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {t("reminder.noBookRemindersTitle")}
                  </p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {t("reminder.noBookRemindersDesc")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookReminders.map((r) => {
                    const doc = r.documentId ? documents[r.documentId] : null;
                    const title = doc?.title || t("reminder.docReminder");
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
                            <span className="capitalize">
                              {r.scheduleType === "daily"
                                ? t("reminder.daily")
                                : r.scheduleType === "weekdays"
                                ? t("reminder.weekdays")
                                : t("reminder.custom")}
                            </span>
                            <span>&middot;</span>
                            <span>{minToTimeString(r.timeOfDayMin)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={r.enabled}
                            aria-label={t("reminder.toggleForDoc", { title })}
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
                            aria-label={t("reminder.deleteForDoc", { title })}
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
