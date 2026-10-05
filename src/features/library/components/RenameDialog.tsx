import React, { useState, useEffect } from "react";
import { Edit3, X } from "lucide-react";
import type { DocumentSummary } from "@/types";

export interface RenameDialogProps {
  isOpen: boolean;
  document: DocumentSummary | null;
  isRenaming: boolean;
  onConfirm: (doc: DocumentSummary, newTitle: string) => Promise<void>;
  onClose: () => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  document: doc,
  isRenaming,
  onConfirm,
  onClose,
}) => {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setError(null);
    }
  }, [doc]);

  if (!isOpen || !doc) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) {
      setError("Title cannot be empty");
      return;
    }
    if (clean.length > 200) {
      setError("Title cannot exceed 200 characters");
      return;
    }
    setError(null);
    await onConfirm(doc, clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-container shadow-overlay p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-accent" />
            <h2 className="font-serif font-semibold text-lg text-foreground">
              Rename Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRenaming}
            className="p-1 rounded-control text-muted hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="document-title"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              Document Title
            </label>
            <input
              id="document-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              disabled={isRenaming}
              maxLength={200}
              autoFocus
              className="w-full h-11 px-3.5 rounded-control bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex justify-between items-center text-[11px] text-muted mt-1.5">
              <span>{error ? <span className="text-danger">{error}</span> : "1–200 characters"}</span>
              <span>{title.length}/200</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRenaming}
              className="h-10 px-4 rounded-control text-sm font-medium text-muted hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRenaming || !title.trim()}
              className="h-10 px-5 rounded-control bg-accent text-accent-foreground text-sm font-medium hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isRenaming ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
