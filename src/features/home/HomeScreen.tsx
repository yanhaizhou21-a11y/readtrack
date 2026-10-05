import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { getHomeDashboard } from "@/features/tracker/api";
import { HomeDashboard } from "@/types";
import {
  Search,
  BookOpen,
  Clock,
  Flame,
  CheckCircle2,
  ChevronRight,
  Play,
  Map,
  Plus,
  Bookmark,
} from "lucide-react";

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHomeDashboard();
      setDashboard(data);
    } catch (err: unknown) {
      console.error("Failed to fetch home dashboard:", err);
      setError("Failed to load reading dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => navigate("/annotations")}
        aria-label="Clippings & Annotations"
        title="Clippings & Annotations"
        className="w-9 h-9 flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <Bookmark className="w-4 h-4 text-muted" />
      </button>
      <button
        type="button"
        onClick={() => navigate("/search")}
        aria-label="Search documents"
        title="Search"
        className="w-9 h-9 flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <Search className="w-4 h-4 text-muted" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header
          title="ReadTrack"
          subtitle="Local-first reading tracker"
          actions={headerActions}
        />
        <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
          <LoadingSkeleton className="h-44 w-full rounded-card" />
          <LoadingSkeleton className="h-28 w-full rounded-card" />
          <LoadingSkeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex-1 flex flex-col">
        <Header
          title="ReadTrack"
          subtitle="Local-first reading tracker"
          actions={headerActions}
        />
        <div className="flex-1 flex items-center justify-center p-4">
          <ErrorState
            title="Failed to Load Dashboard"
            message={error || "Could not retrieve reading dashboard."}
            actions={[{ label: "Try Again", onClick: loadDashboard }]}
          />
        </div>
      </div>
    );
  }

  const hasContent =
    Boolean(dashboard.continueReading) ||
    dashboard.recent.length > 0 ||
    dashboard.currentlyReading > 0 ||
    dashboard.completed > 0;

  if (!hasContent) {
    return (
      <div className="flex-1 flex flex-col">
        <Header
          title="ReadTrack"
          subtitle="Local-first reading tracker"
          actions={headerActions}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <EmptyState
            title="Welcome to ReadTrack"
            body="Import a document to begin. Everything stays on your device."
            primaryAction={{
              label: "Open Library",
              onClick: () => navigate("/library"),
            }}
            hint="PDF · DOCX · EPUB · RTF · TXT · Markdown"
          />
        </div>
      </div>
    );
  }

  // Calculate week & today activity from activity array
  const todayMs = dashboard.activity.length > 0 ? dashboard.activity[dashboard.activity.length - 1]?.ms ?? 0 : 0;
  const weekMs = dashboard.activity.reduce((acc, curr) => acc + curr.ms, 0);
  const todayMinutes = Math.round(todayMs / 60000);
  const weekMinutes = Math.round(weekMs / 60000);
  const maxDayMs = Math.max(1, ...dashboard.activity.map((d) => d.ms));

  const getFormatBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return "bg-danger/10 text-danger border-danger/20";
      case "md":
      case "markdown":
        return "bg-accent/10 text-accent border-accent/20";
      case "epub":
        return "bg-success/10 text-success border-success/20";
      default:
        return "bg-muted/20 text-muted border-muted/30";
    }
  };

  const continueDoc = dashboard.continueReading?.document;
  const continueProgress = dashboard.continueReading?.progress ?? 0;
  const continueProgressPercent = Math.round(continueProgress * 100);

  return (
    <div className="flex-1 flex flex-col pb-safe">
      <Header
        title="ReadTrack"
        subtitle="Local-first reading tracker"
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-lg mx-auto w-full">
        {/* Hero: Continue Reading Card */}
        {dashboard.continueReading && continueDoc && (
          <div className="p-4 rounded-card bg-surface border border-border shadow-xs hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-medium">
                Continue Reading
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase ${getFormatBadge(
                  continueDoc.fileType
                )}`}
              >
                {continueDoc.fileType}
              </span>
            </div>

            <h2 className="font-serif font-bold text-lg text-foreground line-clamp-1 mb-1">
              {continueDoc.title}
            </h2>

            {dashboard.continueReading.sectionTitle && (
              <p className="text-xs text-muted truncate mb-3">
                Chapter: {dashboard.continueReading.sectionTitle}
              </p>
            )}

            {/* Progress bar */}
            <div className="space-y-1.5 my-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Progress</span>
                <span className="font-mono font-medium text-foreground">
                  {continueProgressPercent}%
                </span>
              </div>
              <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${continueProgressPercent}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigate(`/read/${continueDoc.id}`)}
                className="flex-1 h-9 rounded-control bg-primary text-primary-foreground font-medium text-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Reading
              </button>
              <button
                type="button"
                onClick={() => navigate(`/tracker/${continueDoc.id}`)}
                aria-label="View Reading Map"
                className="h-9 px-3 rounded-control border border-border bg-surface hover:bg-surface-2 text-foreground font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Map className="w-3.5 h-3.5 text-muted" />
                Map
              </button>
            </div>
          </div>
        )}

        {/* Reading Activity Mini Dashboard */}
        <div
          onClick={() => navigate("/tracker")}
          className="p-4 rounded-card bg-surface border border-border shadow-xs hover:border-primary/40 cursor-pointer transition-colors"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate("/tracker");
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Reading Activity</span>
            </div>
            <div className="flex items-center text-xs text-muted hover:text-foreground">
              <span>View Details</span>
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div className="p-2 rounded-control bg-surface-2">
              <div className="text-[10px] text-muted flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-primary" />
                Today
              </div>
              <div className="font-serif font-bold text-sm text-foreground mt-0.5">
                {todayMinutes}m
              </div>
            </div>

            <div className="p-2 rounded-control bg-surface-2">
              <div className="text-[10px] text-muted flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-amber-500" />
                7 Days
              </div>
              <div className="font-serif font-bold text-sm text-foreground mt-0.5">
                {weekMinutes}m
              </div>
            </div>

            <div className="p-2 rounded-control bg-surface-2">
              <div className="text-[10px] text-muted flex items-center justify-center gap-1">
                <BookOpen className="w-3 h-3 text-blue-500" />
                Reading
              </div>
              <div className="font-serif font-bold text-sm text-foreground mt-0.5">
                {dashboard.currentlyReading}
              </div>
            </div>

            <div className="p-2 rounded-control bg-surface-2">
              <div className="text-[10px] text-muted flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Finished
              </div>
              <div className="font-serif font-bold text-sm text-foreground mt-0.5">
                {dashboard.completed}
              </div>
            </div>
          </div>

          {/* Mini 7-day activity bar chart */}
          {dashboard.activity.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-[10px] text-muted mb-2">Past 7 Days</div>
              <div className="flex items-end justify-between gap-1.5 h-12">
                {dashboard.activity.map((item, idx) => {
                  const dayName = new Date(item.date).toLocaleDateString(undefined, {
                    weekday: "narrow",
                  });
                  const barHeightPercent = Math.max(6, Math.round((item.ms / maxDayMs) * 100));
                  const hasReading = item.ms > 0;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        className={`w-full rounded-xs transition-all ${
                          hasReading ? "bg-primary" : "bg-surface-2"
                        }`}
                        style={{ height: `${barHeightPercent}%` }}
                        title={`${item.date}: ${Math.round(item.ms / 60000)} min`}
                      />
                      <span className="text-[9px] font-mono text-muted">{dayName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recently Read / Added List */}
        {dashboard.recent.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-foreground">
                Recent Documents
              </h3>
              <button
                type="button"
                onClick={() => navigate("/library")}
                className="text-xs text-muted hover:text-foreground flex items-center gap-0.5"
              >
                <span>All Books</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2">
              {dashboard.recent.map((doc) => {
                const docPercent = Math.round(doc.progress * 100);

                return (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/read/${doc.id}`)}
                    className="p-3 rounded-card bg-surface border border-border shadow-xs hover:border-primary/40 cursor-pointer flex items-center gap-3 transition-colors"
                  >
                    <div className="w-10 h-12 rounded bg-surface-2 border border-border flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-muted" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-mono px-1 py-0.2 rounded border uppercase ${getFormatBadge(
                            doc.fileType
                          )}`}
                        >
                          {doc.fileType}
                        </span>
                        <h4 className="font-serif font-medium text-sm text-foreground truncate">
                          {doc.title}
                        </h4>
                      </div>

                      {doc.author && (
                        <p className="text-xs text-muted truncate mt-0.5">
                          {doc.author}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${docPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted shrink-0">
                          {docPercent}%
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tracker/${doc.id}`);
                      }}
                      aria-label="View Map"
                      className="w-8 h-8 rounded-control flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
                    >
                      <Map className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick action: Open Library */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => navigate("/library")}
            className="w-full h-11 rounded-control border border-border/80 bg-surface hover:bg-surface-2 text-foreground font-medium text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-muted" />
            <span>Import or browse library</span>
          </button>
        </div>
      </div>
    </div>
  );
};
