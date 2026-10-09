import React, { useState, useEffect } from "react";
import { Bell, Clock, X, Trash2 } from "lucide-react";
import type { DocumentDetail, Reminder, ReminderScheduleType } from "@/types";

export interface BookReminderDialogProps {
  isOpen: boolean;
  document: DocumentDetail | null;
  reminder: Reminder | null;
  onSave: (input: {
    id?: string;
    documentId: string;
    enabled: boolean;
    scheduleType: ReminderScheduleType;
    timeOfDayMin: number;
    daysOfWeek?: number | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

const DAYS = [
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 4, label: "Wed" },
  { bit: 8, label: "Thu" },
  { bit: 16, label: "Fri" },
  { bit: 32, label: "Sat" },
  { bit: 64, label: "Sun" },
];

function minToTimeString(min: number | null | undefined): string {
  if (min === null || min === undefined) return "20:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function timeStringToMin(str: string): number {
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const BookReminderDialog: React.FC<BookReminderDialogProps> = ({
  isOpen,
  document: doc,
  reminder,
  onSave,
  onDelete,
  onClose,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [scheduleType, setScheduleType] = useState<ReminderScheduleType>("daily");
  const [timeStr, setTimeStr] = useState("20:00");
  const [daysMask, setDaysMask] = useState(31);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (reminder) {
      setEnabled(reminder.enabled);
      setScheduleType(reminder.scheduleType);
      setTimeStr(minToTimeString(reminder.timeOfDayMin));
      setDaysMask(reminder.daysOfWeek ?? 31);
    } else {
      setEnabled(true);
      setScheduleType("daily");
      setTimeStr("20:00");
      setDaysMask(31);
    }
  }, [reminder, isOpen]);

  if (!isOpen || !doc) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave({
        id: reminder?.id,
        documentId: doc.id,
        enabled,
        scheduleType,
        timeOfDayMin: timeStringToMin(timeStr),
        daysOfWeek: scheduleType === "custom" ? daysMask : null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!reminder || !onDelete) return;
    setSubmitting(true);
    try {
      await onDelete(reminder.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDay = (bit: number) => {
    const next = daysMask ^ bit;
    if (next === 0) return;
    setDaysMask(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-container shadow-overlay p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent" />
            <h2 className="font-serif font-semibold text-lg text-foreground">
              Book Reminder
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 flex items-center justify-center rounded-control text-muted hover:text-foreground hover:bg-surface-2 transition-colors min-h-[44px] min-w-[44px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-xs text-muted">
            Configure reading reminder for{" "}
            <span className="font-medium text-foreground">{doc.title}</span>.
          </div>

          <div className="flex items-center justify-between p-3 bg-surface-2 rounded-control">
            <span className="text-xs font-medium text-foreground">Reminder Active</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle reminder active"
              onClick={() => setEnabled(!enabled)}
              className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors min-h-[44px] justify-center ${
                enabled ? "bg-accent" : "bg-surface-3"
              }`}
            >
              <div
                className={`bg-surface w-5 h-5 rounded-full shadow-sm transform transition-transform ${
                  enabled ? "translate-x-2.5" : "-translate-x-2.5"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-2">
              Frequency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["daily", "weekdays", "custom"] as ReminderScheduleType[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setScheduleType(st)}
                  className={`min-h-[44px] h-10 rounded-control text-xs font-medium capitalize border transition-all ${
                    scheduleType === st
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border text-foreground hover:bg-surface-2"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {scheduleType === "custom" && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-2">
                Active Days
              </label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => {
                  const active = (daysMask & d.bit) !== 0;
                  return (
                    <button
                      key={d.bit}
                      type="button"
                      onClick={() => toggleDay(d.bit)}
                      className={`min-h-[44px] h-10 rounded-control text-[11px] font-medium border flex items-center justify-center transition-all ${
                        active
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

          <div>
            <label
              htmlFor="book-reminder-time"
              className="text-xs font-medium text-foreground block mb-2"
            >
              Reminder Time
            </label>
            <div className="flex items-center gap-2">
              <input
                id="book-reminder-time"
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full min-h-[44px] h-10 px-3 bg-surface-2 border border-border rounded-control text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <Clock className="w-4 h-4 text-muted shrink-0" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
            {reminder ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="min-h-[44px] h-10 px-3 rounded-control border border-danger/20 text-danger hover:bg-danger/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="min-h-[44px] h-10 px-4 rounded-control border border-border text-foreground hover:bg-surface-2 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] h-10 px-4 rounded-control bg-accent text-accent-foreground font-medium text-xs hover:bg-accent/90 transition-colors"
              >
                {submitting ? "Saving..." : "Save Reminder"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
