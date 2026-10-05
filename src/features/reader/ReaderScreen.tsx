import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Map, CheckCircle2, RotateCcw } from "lucide-react";
import { useUiStore } from "@/stores/ui.store";
import {
  getDocument,
  getDocumentSections,
  touchDocument,
} from "@/features/library/api/documents";
import {
  getReadingMap,
  markDocumentCompleted,
  markDocumentUnread,
} from "@/features/tracker/api";
import { useViewportReporter } from "@/features/reader/hooks/useViewportReporter";
import { RichReader } from "@/features/reader/RichReader";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  DocumentDetail,
  ReadingMap,
  SectionPayload,
  LogicalPosition,
  ReadingProgressUpdatedPayload,
} from "@/types";
import { listen } from "@tauri-apps/api/event";

export const ReaderScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { readerChromeVisible, toggleReaderChrome } = useUiStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [readingMap, setReadingMap] = useState<ReadingMap | null>(null);
  const [sections, setSections] = useState<SectionPayload[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [initialPos, setInitialPos] = useState<LogicalPosition | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const loadDocumentData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // Touch document to update last_opened_at
      touchDocument(id).catch(console.error);

      const [docData, mapData, sectionList] = await Promise.all([
        getDocument(id),
        getReadingMap(id).catch(() => null),
        getDocumentSections(id, 0, 20).catch(() => []),
      ]);

      setDoc(docData);
      setReadingMap(mapData);
      setSections(sectionList);
      setProgress(docData.progress);

      const startingPosition: LogicalPosition =
        docData.position ?? {
          documentId: id,
          percentage: docData.progress,
          parserVersion: 1,
        };
      setInitialPos(startingPosition);
    } catch (err: unknown) {
      console.error("Failed to load document for reading:", err);
      setError("Failed to open document. The file may be unavailable or unreadable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDocumentData();
  }, [loadDocumentData]);

  // Hook into native reading tracking engine
  useViewportReporter({
    documentId: id ?? "",
    initialPosition: initialPos ?? {
      documentId: id ?? "",
      percentage: 0,
      parserVersion: 1,
    },
    containerRef,
    enabled: Boolean(id && initialPos),
  });

  // Listen for real-time progress updates from tracker service
  useEffect(() => {
    if (!id) return;

    let unlisten: (() => void) | undefined;
    listen<ReadingProgressUpdatedPayload>("reading_progress_updated", (event) => {
      if (event.payload.documentId === id) {
        setProgress(event.payload.progress);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [id]);

  const handleMarkCompleted = async () => {
    if (!id) return;
    try {
      const res = await markDocumentCompleted(id);
      setProgress(res.progressPercent);
      const updatedMap = await getReadingMap(id).catch(() => null);
      if (updatedMap) setReadingMap(updatedMap);
    } catch (err) {
      console.error("Failed to mark document completed:", err);
    }
  };

  const handleMarkUnread = async () => {
    if (!id) return;
    try {
      const res = await markDocumentUnread(id);
      setProgress(res.progressPercent);
      const updatedMap = await getReadingMap(id).catch(() => null);
      if (updatedMap) setReadingMap(updatedMap);
    } catch (err) {
      console.error("Failed to reset reading progress:", err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background text-foreground flex flex-col z-50 p-6 space-y-4">
        <LoadingSkeleton className="h-10 w-48 rounded" />
        <LoadingSkeleton className="h-6 w-full rounded" count={8} />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="fixed inset-0 bg-background text-foreground flex flex-col items-center justify-center z-50 p-6">
        <ErrorState
          title="Could Not Open Document"
          message={error || "Document could not be found."}
          onRetry={loadDocumentData}
        />
        <button
          type="button"
          onClick={() => navigate("/library")}
          className="mt-4 px-4 py-2 border border-border rounded-control text-xs"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const progressPercent = Math.round(progress * 100);

  return (
    <div
      className="fixed inset-0 bg-background text-foreground flex flex-col z-50 select-none"
      onClick={toggleReaderChrome}
    >
      {/* 2px progress bar on top when chrome is hidden */}
      {!readerChromeVisible && (
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-transparent z-50 pointer-events-none">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Top chrome bar */}
      <div
        className={`sticky top-0 z-10 bg-background/95 backdrop-blur-md pt-safe border-b border-border/50 transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-14 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-10 h-10 rounded-control flex items-center justify-center hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-serif text-sm font-medium truncate max-w-[180px]">
            {doc.title}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(`/tracker/${doc.id}`)}
              aria-label="Reading Map"
              className="w-9 h-9 rounded-control flex items-center justify-center hover:bg-surface-2 text-muted hover:text-foreground transition-colors"
            >
              <Map className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs text-muted w-10 text-right">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Reader body area */}
      <div
        className="flex-1 flex flex-col min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {sections.length > 0 ? (
          <RichReader
            sections={sections}
            readingMap={readingMap}
            containerRef={containerRef}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="font-serif text-lg text-foreground mb-2">{doc.title}</p>
            <p className="font-mono text-xs text-muted">
              Format: {doc.fileType.toUpperCase()}
            </p>
            <p className="text-xs text-muted mt-4">
              Content is ready. Scroll to start tracking.
            </p>
          </div>
        )}
      </div>

      {/* Bottom chrome bar */}
      <div
        className={`sticky bottom-0 z-10 bg-surface/95 backdrop-blur-md pb-safe border-t border-border/50 transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-12 max-w-md mx-auto text-xs px-4">
          <button
            type="button"
            onClick={() => navigate(`/tracker/${doc.id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-control text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <Map className="w-3.5 h-3.5" />
            <span>Reading Map</span>
          </button>

          <div className="flex items-center gap-1">
            {progress < 1 ? (
              <button
                type="button"
                onClick={handleMarkCompleted}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-control text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="Mark entire document as read"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Read</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkUnread}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-control text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                title="Reset progress to unread"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
