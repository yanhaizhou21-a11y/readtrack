import React from "react";
import { AlertTriangle, BookOpen, RefreshCw, X } from "lucide-react";

export interface DuplicateDialogProps {
  isOpen: boolean;
  existingId: string;
  sourcePath: string;
  onOpenExisting: (id: string) => void;
  onReplace: (sourcePath: string) => void;
  onClose: () => void;
}

export const DuplicateDialog: React.FC<DuplicateDialogProps> = ({
  isOpen,
  existingId,
  sourcePath,
  onOpenExisting,
  onReplace,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-container shadow-overlay p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4 text-warning">
          <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <h2 className="font-serif font-semibold text-lg text-foreground">
            Duplicate Document
          </h2>
        </div>

        <p className="text-sm text-muted mb-6 leading-relaxed">
          An identical document already exists in your library. What would you like to do?
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onOpenExisting(existingId)}
            className="flex items-center justify-center gap-2 w-full h-11 px-4 rounded-control bg-accent text-accent-foreground text-sm font-medium hover:opacity-95 transition-opacity"
          >
            <BookOpen className="w-4 h-4" />
            <span>Open Existing Document</span>
          </button>

          <button
            type="button"
            onClick={() => onReplace(sourcePath)}
            className="flex items-center justify-center gap-2 w-full h-11 px-4 rounded-control bg-secondary border border-border text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Replace with New Copy</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full h-10 px-4 rounded-control text-sm font-medium text-muted hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
