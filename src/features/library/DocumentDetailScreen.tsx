import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  Clock,
  FileText,
  HardDrive,
  Hash,
  Layers,
  Edit3,
  Archive,
  ArchiveRestore,
  Trash2,
  Bell,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { ErrorState } from "@/components/feedback/ErrorState";
import type { DocumentDetail, Reminder, ReminderScheduleType } from "@/types";
import {
  getDocument,
  renameDocument,
  archiveDocument,
  deleteDocument,
} from "./api/documents";
import {
  reminderList,
  reminderUpsert,
  reminderDelete,
} from "@/features/settings/reminderApi";
import { RenameDialog } from "./components/RenameDialog";
import { DeleteDialog } from "./components/DeleteDialog";
import { BookReminderDialog } from "./components/BookReminderDialog";

function minToTimeString(min: number | null | undefined): string {
  if (min === null || min === undefined) return "20:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const DocumentDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const fetchDetail = React.useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [detail, reminders] = await Promise.all([
        getDocument(id),
        reminderList().catch(() => []),
      ]);
      setDocument(detail);
      const docReminder = reminders.find((r) => r.documentId === id) ?? null;
      setReminder(docReminder);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load document details";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleRename = async (_doc: unknown, newTitle: string) => {
    if (!document) return;
    setIsRenaming(true);
    try {
      await renameDocument(document.id, newTitle);
      setIsRenameOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      console.error("Rename failed:", err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleArchive = async () => {
    if (!document) return;
    try {
      await archiveDocument(document.id, !document.isArchived);
      await fetchDetail();
    } catch (err: unknown) {
      console.error("Archive toggle failed:", err);
    }
  };

  const handleDelete = async () => {
    if (!document) return;
    setIsDeleting(true);
    try {
      await deleteDocument(document.id);
      navigate("/library");
    } catch (err: unknown) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveReminder = async (input: {
    id?: string;
    documentId: string;
    enabled: boolean;
    scheduleType: ReminderScheduleType;
    timeOfDayMin: number;
    daysOfWeek?: number | null;
  }) => {
    try {
      const saved = await reminderUpsert(input);
      setReminder(saved);
    } catch (err) {
      console.error("Failed to save reminder:", err);
    }
  };

  const handleDeleteReminder = async (remId: string) => {
    try {
      await reminderDelete(remId);
      setReminder(null);
    } catch (err) {
      console.error("Failed to delete reminder:", err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (ms: number): string => {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs}h`;
  };

  const formatDate = (ms: number): string => {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Document Details" showBack />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-8 bg-secondary rounded w-2/3" />
          <div className="h-4 bg-secondary rounded w-1/3" />
          <div className="h-36 bg-secondary rounded-container mt-6" />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Document Details" showBack />
        <div className="flex-1 flex items-center justify-center p-4">
          <ErrorState
            title="Document Not Found"
            message={error ?? `Unable to find document with ID: ${id}`}
            actions={[{ label: "Back to Library", onClick: () => navigate("/library") }]}
          />
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(document.progress * 100);

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Header title="Document Details" showBack />

      <div className="p-4 sm:p-6 max-w-xl mx-auto w-full space-y-6">
        {/* Title & Author Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-xs font-mono font-medium uppercase bg-accent/10 text-accent border border-accent/20">
              {document.fileType}
            </span>
            {document.isArchived && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted/20 text-muted">
                Archived
              </span>
            )}
          </div>
          <h1 className="font-serif font-bold text-2xl text-foreground leading-snug">
            {document.title}
          </h1>
          {document.author && (
            <p className="text-sm text-muted mt-1">{document.author}</p>
          )}
        </div>

        {/* Read Now Button */}
        <button
          type="button"
          onClick={() => navigate(`/read/${document.id}`)}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-control bg-accent text-accent-foreground font-medium text-base shadow-sm hover:opacity-95 transition-opacity"
        >
          <BookOpen className="w-5 h-5" />
          <span>{document.progress > 0 ? "Continue Reading" : "Start Reading"}</span>
        </button>

        {/* Progress Card */}
        <div className="bg-card border border-border rounded-container p-4 space-y-3">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-foreground">Reading Progress</span>
            <span className="text-accent">{progressPercent}%</span>
          </div>
          <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                document.completed ? "bg-success" : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted pt-1">
            <span>{document.completed ? "Completed" : "In Progress"}</span>
            <span>{formatDuration(document.totalReadMs)} spent</span>
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div className="bg-card border border-border rounded-container divide-y divide-border text-sm">
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2 text-muted">
              <FileText className="w-4 h-4" />
              <span>Filename</span>
            </div>
            <span className="text-foreground truncate max-w-[200px]" title={document.originalFilename}>
              {document.originalFilename}
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2 text-muted">
              <HardDrive className="w-4 h-4" />
              <span>File Size</span>
            </div>
            <span className="text-foreground">{formatFileSize(document.fileSize)}</span>
          </div>

          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2 text-muted">
              <Layers className="w-4 h-4" />
              <span>Structure</span>
            </div>
            <span className="text-foreground">
              {document.wordCount
                ? `${document.wordCount.toLocaleString()} words`
                : `${document.sectionCount} sections`}
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2 text-muted">
              <Calendar className="w-4 h-4" />
              <span>Added On</span>
            </div>
            <span className="text-foreground">{formatDate(document.createdAt)}</span>
          </div>

          {document.lastOpenedAt && (
            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2 text-muted">
                <Clock className="w-4 h-4" />
                <span>Last Opened</span>
              </div>
              <span className="text-foreground">{formatDate(document.lastOpenedAt)}</span>
            </div>
          )}

          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-2 text-muted">
              <Hash className="w-4 h-4" />
              <span>Checksum (BLAKE3)</span>
            </div>
            <span className="font-mono text-xs text-muted truncate max-w-[160px]" title={document.contentHash}>
              {document.contentHash}
            </span>
          </div>
        </div>

        {/* Contextual Reading Reminder Row */}
        <div className="bg-card border border-border rounded-container p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-control bg-accent/10 text-accent shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {reminder?.enabled
                  ? `Reminder: ${reminder.scheduleType} at ${minToTimeString(reminder.timeOfDayMin)}`
                  : reminder
                  ? "Reminder paused"
                  : "No reminder scheduled"}
              </div>
              <div className="text-[11px] text-muted truncate">
                {reminder?.enabled
                  ? "Alerts scheduled for this book"
                  : "Set a dedicated schedule for this book"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsReminderOpen(true)}
            className="min-h-[44px] px-3 border border-border rounded-control bg-surface-2 hover:bg-surface-3 text-xs font-medium text-foreground transition-colors shrink-0"
          >
            {reminder ? "Edit" : "Set"}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsRenameOpen(true)}
            className="flex items-center justify-center gap-2 h-11 rounded-control bg-secondary border border-border text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            <span>Rename</span>
          </button>

          <button
            type="button"
            onClick={handleArchive}
            className="flex items-center justify-center gap-2 h-11 rounded-control bg-secondary border border-border text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            {document.isArchived ? (
              <>
                <ArchiveRestore className="w-4 h-4" />
                <span>Unarchive</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Archive</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="flex items-center justify-center gap-2 h-11 rounded-control bg-danger/10 border border-danger/20 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Dialogs */}
      <RenameDialog
        isOpen={isRenameOpen}
        document={document}
        isRenaming={isRenaming}
        onConfirm={handleRename}
        onClose={() => setIsRenameOpen(false)}
      />

      <DeleteDialog
        isOpen={isDeleteOpen}
        document={document}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setIsDeleteOpen(false)}
      />

      <BookReminderDialog
        isOpen={isReminderOpen}
        document={document}
        reminder={reminder}
        onSave={handleSaveReminder}
        onDelete={handleDeleteReminder}
        onClose={() => setIsReminderOpen(false)}
      />
    </div>
  );
};
