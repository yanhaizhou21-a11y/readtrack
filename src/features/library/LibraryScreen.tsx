import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  X,
  Bookmark,
  FileSpreadsheet,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { triggerHaptic } from "@/lib/haptic";
import { useTranslation } from "@/i18n";
import type { DocumentSummary } from "@/types";
import {
  listDocuments,
  importDocument,
  renameDocument,
  archiveDocument,
  deleteDocument,
} from "./api/documents";
import { DocCard } from "./components/DocCard";
import { ImportDialog } from "./components/ImportDialog";
import { DuplicateDialog } from "./components/DuplicateDialog";
import { DeleteDialog } from "./components/DeleteDialog";
import { RenameDialog } from "./components/RenameDialog";

type FilterStatus = "all" | "in_progress" | "completed" | "archived";
type SortOption = "recent_opened" | "recent_added" | "title" | "progress";
type FormatFilter = "all" | "pdf" | "md" | "txt" | "epub" | "docx";

export const LibraryScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent_opened");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Dialogs state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [duplicateInfo, setDuplicateInfo] = useState<{
    existingId: string;
    sourcePath: string;
  } | null>(null);

  const [renameDoc, setRenameDoc] = useState<DocumentSummary | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const [deleteDoc, setDeleteDoc] = useState<DocumentSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listDocuments({
        filter: statusFilter,
        sort: sortBy,
        query: searchQuery.trim() || undefined,
      });
      setDocuments(res.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load documents";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy, searchQuery]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Listen for library_changed events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("library_changed", () => {
      fetchDocuments();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [fetchDocuments]);

  // Format filtering (client-side in-memory filter on loaded results)
  const filteredDocuments = useMemo(() => {
    if (formatFilter === "all") return documents;
    return documents.filter((d) => d.fileType.toLowerCase() === formatFilter);
  }, [documents, formatFilter]);

  // Handlers
  const handleImport = useCallback(async (sourcePath: string, onDuplicate?: "ask" | "open_existing" | "replace") => {
    setIsImporting(true);
    setImportError(null);
    try {
      await importDocument({ source: sourcePath, onDuplicate });
      setIsImportOpen(false);
      setDuplicateInfo(null);
      triggerHaptic("success");
      await fetchDocuments();
    } catch (err: unknown) {
      const e = err as { code?: string; details?: { existingId?: string }; message?: string };
      if (e.code === "DuplicateDocument" && e.details?.existingId) {
        setIsImportOpen(false);
        setDuplicateInfo({ existingId: e.details.existingId, sourcePath });
      } else {
        setImportError(e.message ?? "Failed to import document");
      }
    } finally {
      setIsImporting(false);
    }
  }, [fetchDocuments]);

  // Check external open-with / deep-link query parameter
  useEffect(() => {
    const importSrc = searchParams.get("importSource") || searchParams.get("source");
    if (importSrc) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("importSource");
      nextParams.delete("source");
      setSearchParams(nextParams, { replace: true });
      handleImport(importSrc);
    }
  }, [searchParams, setSearchParams, handleImport]);

  const handleRename = async (doc: DocumentSummary, newTitle: string) => {
    setIsRenaming(true);
    try {
      await renameDocument(doc.id, newTitle);
      setRenameDoc(null);
      await fetchDocuments();
    } catch (err: unknown) {
      console.error("Rename failed:", err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleArchive = async (doc: DocumentSummary) => {
    try {
      await archiveDocument(doc.id, !doc.isArchived);
      await fetchDocuments();
    } catch (err: unknown) {
      console.error("Archive toggle failed:", err);
    }
  };

  const handleDelete = async (doc: DocumentSummary) => {
    setIsDeleting(true);
    try {
      await deleteDocument(doc.id);
      setDeleteDoc(null);
      await fetchDocuments();
    } catch (err: unknown) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => navigate("/export")}
        aria-label="Export Reading Dossier"
        title="Export Reading Dossier"
        className="w-11 h-11 min-w-[44px] min-h-[44px] border border-border flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4 text-muted hover:text-foreground" />
      </button>
      <button
        type="button"
        onClick={() => navigate("/annotations")}
        aria-label="Clippings & Annotations"
        title="Clippings & Annotations"
        className="w-11 h-11 min-w-[44px] min-h-[44px] border border-border flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <Bookmark className="w-4 h-4 text-muted hover:text-foreground" />
      </button>
      <button
        type="button"
        onClick={() => {
          setImportError(null);
          setIsImportOpen(true);
        }}
        aria-label="Import document"
        className="flex items-center gap-1.5 min-h-[44px] px-3.5 border border-border bg-foreground text-background text-xs font-mono font-bold uppercase hover:bg-accent hover:text-white transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>{t("library.import")}</span>
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col relative pb-20">
      <Header title={t("library.title")} actions={headerActions} />

      {/* Search and Filter Section */}
      <div className="p-4 border-b border-border space-y-3 bg-surface">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="w-full h-10 pl-10 pr-9 rounded-control bg-background border border-border text-foreground text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
          {(["all", "in_progress", "completed", "archived"] as FilterStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-[44px] px-3.5 rounded-full font-medium whitespace-nowrap transition-colors flex items-center justify-center ${
                statusFilter === status
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted hover:text-foreground"
              }`}
            >
              {status === "all"
                ? t("library.filterAll")
                : status === "in_progress"
                ? t("library.filterInProgress")
                : status === "completed"
                ? t("library.filterCompleted")
                : t("library.filterArchived")}
            </button>
          ))}
        </div>

        {/* Secondary Bar: Format filters & View Mode */}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          {/* Format Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(["all", "pdf", "md", "txt", "epub", "docx"] as FormatFilter[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatFilter(fmt)}
                className={`min-h-[44px] px-2.5 py-1 rounded text-[11px] font-mono uppercase transition-colors border flex items-center justify-center ${
                  formatFilter === fmt
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "bg-background text-muted border-border hover:border-muted"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          {/* Sort & View Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted absolute left-2 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-9 min-h-[36px] pl-6 pr-2 rounded bg-secondary border border-border text-[11px] text-foreground focus:outline-none cursor-pointer"
              >
                <option value="recent_opened">{t("library.sortRecent")}</option>
                <option value="recent_added">{t("library.sortAdded")}</option>
                <option value="title">{t("library.sortTitle")}</option>
                <option value="progress">{t("library.sortProgress")}</option>
              </select>
            </div>

            <div className="flex items-center rounded border border-border bg-secondary p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={`w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors ${viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={`w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-44 bg-secondary rounded-container border border-border" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title={t("library.errorTitle")}
            message={error}
            actions={[{ label: t("library.retry"), onClick: fetchDocuments }]}
          />
        ) : filteredDocuments.length === 0 ? (
          searchQuery || statusFilter !== "all" || formatFilter !== "all" ? (
            <EmptyState
              title={t("library.noResultsTitle")}
              body={t("library.noResultsBody")}
              primaryAction={{
                label: t("library.clearFilters"),
                onClick: () => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setFormatFilter("all");
                },
              }}
            />
          ) : (
            <EmptyState
              title={t("library.emptyTitle")}
              body={t("library.emptyBody")}
              primaryAction={{
                label: t("library.importDocument"),
                onClick: () => setIsImportOpen(true),
              }}
              hint="PDF · DOCX · EPUB · RTF · TXT · Markdown"
            />
          )
        ) : (
          <VirtualGrid
            items={filteredDocuments}
            itemKey={(doc) => doc.id}
            columns={viewMode === "grid" ? 2 : 1}
            itemHeight={viewMode === "grid" ? 260 : 76}
            overscan={2}
            className="flex-1 min-h-[400px]"
            gridClassName={
              viewMode === "grid"
                ? "grid grid-cols-2 gap-3"
                : "flex flex-col gap-2.5"
            }
            renderItem={(doc) => (
              <DocCard
                key={doc.id}
                document={doc}
                viewMode={viewMode}
                onRename={(d) => setRenameDoc(d)}
                onArchive={handleArchive}
                onDelete={(d) => setDeleteDoc(d)}
              />
            )}
          />
        )}
      </div>

      {/* Floating Action Button (FAB) on mobile */}
      <button
        type="button"
        onClick={() => {
          setImportError(null);
          setIsImportOpen(true);
        }}
        aria-label="Import document"
        className="fixed right-5 bottom-20 z-40 sm:hidden flex items-center justify-center w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-overlay hover:opacity-95 transition-transform active:scale-95"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Dialogs */}
      <ImportDialog
        isOpen={isImportOpen}
        isImporting={isImporting}
        error={importError}
        onClose={() => setIsImportOpen(false)}
        onImport={(src) => handleImport(src)}
        onSuccess={() => fetchDocuments()}
      />

      <DuplicateDialog
        isOpen={duplicateInfo !== null}
        existingId={duplicateInfo?.existingId ?? ""}
        sourcePath={duplicateInfo?.sourcePath ?? ""}
        onOpenExisting={(id) => {
          setDuplicateInfo(null);
          // Navigate to reader for existing document
          navigate(`/read/${id}`);
        }}
        onReplace={(src) => handleImport(src, "replace")}
        onClose={() => setDuplicateInfo(null)}
      />

      <RenameDialog
        isOpen={renameDoc !== null}
        document={renameDoc}
        isRenaming={isRenaming}
        onConfirm={handleRename}
        onClose={() => setRenameDoc(null)}
      />

      <DeleteDialog
        isOpen={deleteDoc !== null}
        document={deleteDoc}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteDoc(null)}
      />
    </div>
  );
};
