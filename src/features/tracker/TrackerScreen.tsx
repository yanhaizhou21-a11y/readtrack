import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import {
  getTrackerOverview,
  getReadingSessions,
} from "@/features/tracker/api";
import { TrackerOverview, ReadingSession } from "@/types";
import {
  Clock,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  Map,
  Flame,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { triggerHaptic } from "@/lib/haptic";

export const TrackerScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TrackerOverview | null>(null);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, sessionsData] = await Promise.all([
        getTrackerOverview(),
        getReadingSessions({ limit: 10 }),
      ]);
      setOverview(overviewData);
      setSessions(sessionsData);
    } catch (err: unknown) {
      console.error("Failed to load tracker overview:", err);
      setError("Failed to load reading tracker statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title={t("tracker.title")} />
        <div className="p-4 space-y-4">
          <LoadingSkeleton className="h-28 w-full rounded-card" />
          <LoadingSkeleton className="h-40 w-full rounded-card" />
          <LoadingSkeleton className="h-48 w-full rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title={t("tracker.title")} />
        <div className="flex-1 flex items-center justify-center p-4">
          <ErrorState
            title={t("tracker.errorTitle")}
            message={error || t("tracker.errorMessage")}
            actions={[{ label: t("tracker.tryAgain"), onClick: loadData }]}
          />
        </div>
      </div>
    );
  }

  const todayMinutes = Math.round(overview.todayMs / 60000);
  const weekMinutes = Math.round(overview.weekMs / 60000);

  const hasActivity =
    overview.documents > 0 ||
    overview.todayMs > 0 ||
    overview.weekMs > 0 ||
    sessions.length > 0;

  if (!hasActivity) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title={t("tracker.title")} />
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            title={t("tracker.emptyTitle")}
            body={t("tracker.emptyBody")}
            primaryAction={{
              label: t("tracker.openLibrary"),
              onClick: () => navigate("/library"),
            }}
          />
        </div>
      </div>
    );
  }

  // Find max activity day for bar chart scaling
  const maxDayMs = Math.max(1, ...overview.activityByDay.map((d) => d.ms));

  return (
    <div className="flex-1 flex flex-col pb-safe">
      <Header title={t("tracker.title")} subtitle={t("tracker.subtitle")} />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-lg mx-auto w-full">
        {/* Key metrics cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs">
            <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
              <Clock className="w-4 h-4 text-primary" />
              <span>{t("tracker.todayMinutes")}</span>
            </div>
            <div className="font-serif font-bold text-2xl text-foreground">
              {todayMinutes} <span className="text-sm font-sans font-normal text-muted">min</span>
            </div>
            <div className="text-[11px] text-muted mt-1">{t("tracker.activeReadingTime")}</div>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-xs">
            <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>{t("tracker.thisWeek")}</span>
            </div>
            <div className="font-serif font-bold text-2xl text-foreground">
              {weekMinutes} <span className="text-sm font-sans font-normal text-muted">min</span>
            </div>
            <div className="text-[11px] text-muted mt-1">{t("tracker.past7DaysTotal")}</div>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-xs">
            <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>{t("tracker.inLibrary")}</span>
            </div>
            <div className="font-serif font-bold text-2xl text-foreground">
              {overview.documents}
            </div>
            <div className="text-[11px] text-muted mt-1">{t("tracker.importedDocuments")}</div>
          </div>

          <div className="p-4 rounded-card bg-surface border border-border shadow-xs">
            <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{t("tracker.finished")}</span>
            </div>
            <div className="font-serif font-bold text-2xl text-foreground">
              {overview.completed}
            </div>
            <div className="text-[11px] text-muted mt-1">{t("tracker.completedReading")}</div>
          </div>
        </div>

        {/* 7-Day Activity Chart */}
        <div className="p-4 rounded-card bg-surface border border-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-serif font-bold text-sm text-foreground">
                {t("tracker.dailyActivity")}
              </h3>
            </div>
            <span className="text-xs text-muted font-mono">{weekMinutes}m total</span>
          </div>

          {/* Bar Chart */}
          <div className="flex items-end justify-between gap-2 h-28 pt-4 pb-2 px-1">
            {overview.activityByDay.map((day) => {
              const dayMin = Math.round(day.ms / 60000);
              const heightPercent = Math.max(8, Math.round((day.ms / maxDayMs) * 100));
              const dateObj = new Date(day.date);
              const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                dateObj.getDay()
              ];

              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                  title={`${day.date}: ${dayMin} minutes`}
                >
                  <span className="text-[10px] text-muted font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {dayMin}m
                  </span>
                  <div className="w-full max-w-[28px] bg-surface-2 rounded-t overflow-hidden flex flex-col justify-end h-full">
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        dayMin > 0 ? "bg-primary" : "bg-transparent"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-muted">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Currently Reading Books */}
        {overview.currentlyReading.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-serif font-bold text-sm text-foreground">
                {t("tracker.currentlyReading")}
              </h3>
              <span className="text-xs text-muted">
                {t("tracker.booksCount", { count: overview.currentlyReading.length })}
              </span>
            </div>

            <div className="space-y-2.5">
              {overview.currentlyReading.map((doc) => {
                const percent = Math.round(doc.progress * 100);
                return (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-card bg-surface border border-border flex items-center justify-between gap-3 hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => {
                      triggerHaptic("tick");
                      navigate(`/tracker/${doc.id}`);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        triggerHaptic("tick");
                        navigate(`/tracker/${doc.id}`);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground truncate">
                        {doc.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                        <span className="font-mono font-medium">{percent}%</span>
                        <div className="flex-1 h-1.5 max-w-[120px] bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic("tick");
                          navigate(`/read/${doc.id}`);
                        }}
                        className="px-2.5 py-1 rounded-control bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                      >
                        {t("tracker.readAction")}
                      </button>
                      <Map className="w-4 h-4 text-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Reading Sessions */}
        {sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="font-serif font-bold text-sm text-foreground px-1">
              {t("tracker.recentSessions")}
            </h3>

            <div className="space-y-2">
              {sessions.map((s) => {
                const durationMin = Math.max(1, Math.round(s.durationSeconds / 60));
                const activeMin = Math.round(s.activeSeconds / 60);
                const dateStr = new Date(s.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={s.id}
                    className="p-3 rounded-card bg-surface border border-border/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {t("tracker.sessionSummary", {
                          duration: durationMin,
                          active: activeMin,
                        })}
                      </div>
                      <div className="text-muted mt-0.5">{dateStr}</div>
                    </div>
                    <div className="text-right font-mono text-muted">
                      {s.segmentsRead > 0 && (
                        <span>
                          {t("tracker.segmentsRead", { count: s.segmentsRead })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
