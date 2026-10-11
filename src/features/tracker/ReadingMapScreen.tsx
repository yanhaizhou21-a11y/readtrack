import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ChapterBar } from "@/features/tracker/components/ChapterBar";
import { ReadingSpine } from "@/features/tracker/components/ReadingSpine";
import { SegmentModal } from "@/features/tracker/components/SegmentModal";
import {
  getReadingMap,
  markDocumentCompleted,
  markDocumentUnread,
} from "@/features/tracker/api";
import { getDocument } from "@/features/library/api/documents";
import { MapSection, MapSegment, ReadingMap, DocumentDetail } from "@/types";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  RotateCcw,
  Play,
  Layers,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { triggerHaptic } from "@/lib/haptic";

export const ReadingMapScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<ReadingMap | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [selectedSection, setSelectedSection] = useState<MapSection | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<MapSegment | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [mapData, docData] = await Promise.all([
        getReadingMap(id),
        getDocument(id),
      ]);
      setMap(mapData);
      setDoc(docData);
      if (mapData.sections.length > 0 && mapData.sections[0]) {
        setSelectedSection(mapData.sections[0]);
      }
    } catch (err: unknown) {
      console.error("Failed to load reading map:", err);
      setError("Failed to load reading map for this document.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMarkCompleted = async () => {
    if (!id) return;
    setIsUpdating(true);
    try {
      await markDocumentCompleted(id);
      triggerHaptic("success");
      await loadData();
    } catch (err) {
      console.error("Failed to mark completed:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkUnread = async () => {
    if (!id) return;
    setIsUpdating(true);
    try {
      await markDocumentUnread(id);
      triggerHaptic("tick");
      await loadData();
    } catch (err) {
      console.error("Failed to mark unread:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleContinueReading = (segment?: MapSegment) => {
    if (!id) return;
    triggerHaptic("tick");
    if (segment && selectedSection) {
      navigate(`/read/${id}?section=${selectedSection.index}&segment=${segment.index}`);
    } else {
      navigate(`/read/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title={t("map.title")} showBack />
        <div className="p-4 space-y-4">
          <LoadingSkeleton className="h-36 w-full rounded-card" />
          <LoadingSkeleton className="h-28 w-full rounded-card" />
          <LoadingSkeleton className="h-48 w-full rounded-card" />
        </div>
      </div>
    );
  }

  if (error || !map || !doc) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title={t("map.title")} showBack />
        <div className="flex-1 flex items-center justify-center p-4">
          <ErrorState
            title={t("map.errorTitle")}
            message={error || t("map.errorMessage")}
            actions={[{ label: t("map.tryAgain"), onClick: loadData }]}
          />
        </div>
      </div>
    );
  }

  const percent = Math.round(map.progress * 100);
  const totalMinutes = Math.round(map.totalReadMs / 60000);
  const allSegments = map.sections.flatMap((s) => s.segments);

  return (
    <div className="flex-1 flex flex-col pb-safe">
      <Header
        title={doc.title}
        subtitle={t("map.subtitle")}
        showBack
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-5 max-w-lg mx-auto w-full">
        {/* Progress Overview Card */}
        <div className="p-5 rounded-card bg-surface border border-border shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-mono font-bold text-base ${
                  map.completed || percent >= 98
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}
              >
                {percent}%
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-foreground leading-snug">
                  {map.completed
                    ? t("map.bookCompleted")
                    : t("map.percentCompleted", { percent })}
                </h3>
                <p className="text-xs text-muted">
                  {t("map.chapterSegmentsCount", {
                    chapters: map.sections.length,
                    segments: allSegments.length,
                  })}
                </p>
              </div>
            </div>

            {map.completed && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("map.finishedBadge")}
              </span>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs text-muted">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span>
                <strong className="text-foreground font-mono font-semibold">
                  {totalMinutes}m
                </strong>{" "}
                {t("map.readTime")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span>
                <strong className="text-foreground font-mono font-semibold">
                  {map.sessions}
                </strong>{" "}
                {t("map.sessions")}
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleContinueReading()}
              className="flex-1 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              {t("map.continueReading")}
            </button>

            {!map.completed ? (
              <button
                type="button"
                onClick={handleMarkCompleted}
                disabled={isUpdating}
                className="h-10 px-3 rounded-control border border-border text-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-surface-2 active:scale-[0.98] transition-all disabled:opacity-50"
                title="Mark all as read"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                {t("map.complete")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkUnread}
                disabled={isUpdating}
                className="h-10 px-3 rounded-control border border-border text-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-surface-2 active:scale-[0.98] transition-all disabled:opacity-50"
                title="Reset progress"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted" />
                {t("map.reset")}
              </button>
            )}
          </div>
        </div>

        {/* Segment Spine / Heatmap */}
        <div className="p-4 rounded-card bg-surface border border-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h4 className="font-serif font-bold text-sm text-foreground">
                {t("map.readingHeatmap")}
              </h4>
            </div>
            <span className="text-xs text-muted font-mono">
              {t("map.heatmapReadRatio", {
                read: allSegments.filter((s) => s.status === "read").length,
                total: allSegments.length,
              })}
            </span>
          </div>

          <ReadingSpine
            segments={allSegments}
            onSelectSegment={(seg) => setSelectedSegment(seg)}
            selectedSegmentIndex={selectedSegment?.index}
          />
        </div>

        {/* Chapter Breakdown */}
        <div className="flex flex-col gap-3">
          <h4 className="font-serif font-bold text-sm text-foreground px-1">
            {t("map.chaptersAndSections")}
          </h4>

          {map.sections.length === 0 ? (
            <EmptyState
              title={t("map.noSectionsTitle")}
              body={t("map.noSectionsBody")}
            />
          ) : (
            <div className="space-y-2.5">
              {map.sections.map((sec) => (
                <ChapterBar
                  key={sec.sectionId}
                  section={sec}
                  isActive={selectedSection?.sectionId === sec.sectionId}
                  onClick={(s) => {
                    setSelectedSection(s);
                    // Navigate directly to reading section
                    navigate(`/read/${id}?section=${s.index}`);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Segment detail modal */}
      <SegmentModal
        segment={selectedSegment}
        onClose={() => setSelectedSegment(null)}
        onContinueReading={(seg) => handleContinueReading(seg)}
      />
    </div>
  );
};
