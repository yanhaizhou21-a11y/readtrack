import { AlertCircle, Trash2 } from "lucide-react";
import type { DocumentSummary } from "@/types";

export interface DeleteDialogProps {
  isOpen: boolean;
  document: DocumentSummary | null;
  isDeleting: boolean;
  onConfirm: (doc: DocumentSummary) => Promise<void>;
  onClose: () => void;
}

export const DeleteDialog: React.FC<DeleteDialogProps> = ({
  isOpen,
  document: doc,
  isDeleting,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-container shadow-overlay p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4 text-danger">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-danger" />
          </div>
          <h2 className="font-serif font-semibold text-lg text-foreground">
            Delete Document
          </h2>
        </div>

        <p className="text-sm text-muted mb-2 leading-relaxed">
          Are you sure you want to delete <span className="font-semibold text-foreground">"{doc.title}"</span>?
        </p>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          This will permanently delete the document file from your device, along with all reading progress, statistics, and notes. This action cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 h-10 px-4 rounded-control text-sm font-medium text-muted hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onConfirm(doc)}
            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-control bg-danger text-white text-sm font-medium hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
