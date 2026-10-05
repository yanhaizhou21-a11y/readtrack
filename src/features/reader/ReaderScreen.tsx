import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Map,
  CheckCircle2,
  RotateCcw,
  Bookmark as BookmarkIcon,
  Search as SearchIcon,
  Check,
} from "lucide-react";
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
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
} from "@/features/annotations/api";
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
  Bookmark,
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
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const loadDocumentData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // Touch document to update last_opened_at
      touchDocument(id).catch(console.error);

      const [docData, mapData, sectionList, bms] = await Promise.all([
        getDocument(id),
        getReadingMap(id).catch(() => null),
        getDocumentSections(id, 0, 20).catch(() => []),
        listBookmarks(id).catch(() => []),
      ]);

      setDoc(docData);
      setReadingMap(mapData);
      setSections(sectionList);
      setProgress(docData.progress);
      setBookmarks(bms);

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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2500);
  };

  const handleToggleBookmark = async () => {
    if (!id || !doc) return;
    const currentPct = progress;
    // Check if there is already a bookmark within 3% of current progress
    const existing = bookmarks.find(
      (b) => Math.abs(b.position.percentage - currentPct) < 0.03
    );

    if (existing) {
      try {
        await deleteBookmark(existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        showToast("Bookmark removed");
      } catch (err) {
        console.error("Failed to remove bookmark:", err);
      }
    } else {
      const pos: LogicalPosition = initialPos ?? {
        documentId: id,
        percentage: currentPct,
        parserVersion: 1,
      };

      try {
        const newBm = await createBookmark({
          documentId: id,
          position: pos,
          title: `${Math.round(currentPct * 100)}% through ${doc.title}`,
        });
        setBookmarks((prev) => [newBm, ...prev]);
        showToast("Bookmark filed");
      } catch (err) {
        console.error("Failed to create bookmark:", err);
      }
    }
  };

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
        <LoadingSkeleton className="h-10 w-48 rounded-none" />
        <LoadingSkeleton className="h-6 w-full rounded-none" count={8} />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="fixed inset-0 bg-background text-foreground flex flex-col items-center justify-center z-50 p-6">
        <ErrorState
          title="Could Not Open Document"
          message={error || "Document could not be found."}
          actions={[{ label: "Try Again", onClick: loadDocumentData }]}
        />
        <button
          type="button"
          onClick={() => navigate("/library")}
          className="mt-4 px-4 py-2 border-2 border-border text-xs font-mono uppercase"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const progressPercent = Math.round(progress * 100);
  const isBookmarkedHere = bookmarks.some(
    (b) => Math.abs(b.position.percentage - progress) < 0.03
  );

  return (
    <div
      className="fixed inset-0 bg-background text-foreground flex flex-col z-50 select-none"
      onClick={toggleReaderChrome}
    >
      {/* 2px progress bar on top when chrome is hidden */}
      {!readerChromeVisible && (
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-transparent z-50 pointer-events-none">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Top chrome bar */}
      <div
        className={`sticky top-0 z-10 bg-background/95 backdrop-blur-md pt-safe border-b-2 border-border transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 h-14 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <span className="font-serif text-sm font-bold truncate max-w-[150px]">
            {doc.title}
          </span>

          <div className="flex items-center gap-1">
            {/* Bookmark button */}
            <button
              type="button"
              onClick={handleToggleBookmark}
              aria-label={isBookmarkedHere ? "Remove bookmark" : "Add bookmark"}
              title={isBookmarkedHere ? "Remove bookmark" : "Add bookmark"}
              className={`w-9 h-9 flex items-center justify-center transition-colors ${
                isBookmarkedHere
                  ? "text-accent bg-accent/10"
                  : "text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <BookmarkIcon
                className={`w-4 h-4 ${isBookmarkedHere ? "fill-accent" : ""}`}
              />
            </button>

            {/* Global Search button */}
            <button
              type="button"
              onClick={() => navigate("/search")}
              aria-label="Search"
              title="Search Archives"
              className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <SearchIcon className="w-4 h-4" />
            </button>

            {/* Reading Map */}
            <button
              type="button"
              onClick={() => navigate(`/tracker/${doc.id}`)}
              aria-label="Reading Map"
              title="Reading Map"
              className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Map className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs text-muted w-10 text-right font-bold">
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
            documentId={id ?? ""}
            sections={sections}
            readingMap={readingMap}
            currentPosition={initialPos}
            containerRef={containerRef}
            onAnnotationCreated={() => loadDocumentData()}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="font-serif text-lg font-bold text-foreground mb-2">{doc.title}</p>
            <p className="font-mono text-xs text-muted uppercase">
              Format: {doc.fileType.toUpperCase()}
            </p>
            <p className="font-serif text-xs text-muted mt-4">
              Content is ready. Scroll to start tracking.
            </p>
          </div>
        )}
      </div>

      {/* Bottom chrome bar */}
      <div
        className={`sticky bottom-0 z-10 bg-surface/95 backdrop-blur-md pb-safe border-t-2 border-border transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-12 max-w-md mx-auto text-xs px-4 font-mono uppercase">
          <button
            type="button"
            onClick={() => navigate(`/annotations`)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <BookmarkIcon className="w-3.5 h-3.5" />
            <span>Clippings ({bookmarks.length})</span>
          </button>

          <div className="flex items-center gap-1">
            {progress < 1 ? (
              <button
                type="button"
                onClick={handleMarkCompleted}
                className="flex items-center gap-1 px-2.5 py-1 text-accent font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Mark entire document as read"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Read</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkUnread}
                className="flex items-center gap-1 px-2.5 py-1 text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Reset progress to unread"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating feedback toast */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2 border-2 border-border font-mono text-xs uppercase flex items-center gap-2 shadow-md">
          <Check className="w-3.5 h-3.5 text-accent" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
