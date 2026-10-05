import React, { useState } from "react";
import { X, Upload, Loader2, AlertCircle } from "lucide-react";

export interface ImportDialogProps {
  isOpen: boolean;
  isImporting: boolean;
  error?: string | null;
  onClose: () => void;
  onImport: (sourcePath: string) => Promise<void>;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  isImporting,
  error,
  onClose,
  onImport,
}) => {
  const [sourcePath, setSourcePath] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sourcePath.trim();
    if (!clean) {
      setValidationError("Please enter a valid file path");
      return;
    }
    setValidationError(null);
    await onImport(clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full sm:max-w-md bg-surface border border-border rounded-t-container sm:rounded-container shadow-overlay p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" />
            <h2 className="font-serif font-semibold text-lg text-foreground">
              Import Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="p-1 rounded-control text-muted hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="source-path"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              Document File Path
            </label>
            <input
              id="source-path"
              type="text"
              value={sourcePath}
              onChange={(e) => {
                setSourcePath(e.target.value);
                setValidationError(null);
              }}
              placeholder="e.g. C:/documents/book.md or /path/to/paper.pdf"
              disabled={isImporting}
              autoFocus
              className="w-full h-11 px-3.5 rounded-control bg-background border border-border text-foreground text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <p className="text-[11px] text-muted mt-1.5">
              Supported formats: <span className="font-medium">PDF, Markdown, TXT, EPUB, DOCX, RTF</span>
            </p>
          </div>

          {(validationError || error) && (
            <div className="flex items-start gap-2 p-3 rounded-control bg-danger/10 border border-danger/20 text-danger text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{validationError || error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="h-10 px-4 rounded-control text-sm font-medium text-muted hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isImporting}
              className="flex items-center justify-center gap-2 h-10 px-5 rounded-control bg-accent text-accent-foreground text-sm font-medium hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Import</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
