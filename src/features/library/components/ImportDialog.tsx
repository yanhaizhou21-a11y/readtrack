import React, { useState, useRef } from "react";
import { X, Upload, Loader2, AlertCircle, FileText, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { importDocumentBytes } from "@/features/library/api/documents";

export interface ImportDialogProps {
  isOpen: boolean;
  isImporting: boolean;
  error?: string | null;
  onClose: () => void;
  onImport: (sourcePath: string) => Promise<void>;
  onSuccess?: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  isImporting,
  error,
  onClose,
  onImport,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        setSelectedFile(file);
        setLocalError(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        setLocalError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // If a physical file was chosen via picker
    if (selectedFile) {
      setLoading(true);
      try {
        const filePath = (selectedFile as unknown as { path?: string }).path;
        if (filePath && typeof filePath === "string" && filePath.length > 0) {
          // Desktop Tauri provides native file path
          await onImport(filePath);
        } else {
          // Mobile WebView / Browser: read buffer and import bytes directly
          const buffer = await selectedFile.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          await importDocumentBytes({
            fileName: selectedFile.name,
            data: bytes,
          });
          onSuccess?.();
          onClose();
        }
      } catch (err: unknown) {
        console.error("Failed to import selected file:", err);
        setLocalError(err instanceof Error ? err.message : "Failed to import file.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fallback: manual path was entered
    const cleanPath = manualPath.trim();
    if (!cleanPath) {
      setLocalError("Please choose a document to import.");
      return;
    }

    await onImport(cleanPath);
  };

  const effectiveLoading = isImporting || loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border-2 border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: "0px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-border mb-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" />
            <h2 className="font-serif font-black text-xl text-foreground uppercase tracking-tight">
              Import Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={effectiveLoading}
            className="w-8 h-8 flex items-center justify-center border border-transparent hover:border-border text-foreground transition-colors"
            style={{ borderRadius: "0px" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.docx,.epub,.rtf,.txt,.md"
            className="hidden"
          />

          {/* Interactive File Drop / Picker Zone */}
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`p-6 border-2 border-dashed cursor-pointer transition-colors text-center flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? "border-accent bg-accent/5"
                  : "border-border/60 hover:border-border hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              style={{ borderRadius: "0px" }}
            >
              <div className="w-12 h-12 border border-border flex items-center justify-center bg-surface">
                <Upload className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="font-serif font-bold text-base text-foreground mb-1">
                  Choose Document to Import
                </p>
                <p className="text-xs text-muted">
                  Tap to browse from your device storage or files
                </p>
              </div>
              <div className="px-3 py-1 bg-surface border border-border text-[11px] font-mono text-muted uppercase">
                PDF · EPUB · DOCX · TXT · MD
              </div>
            </div>
          ) : (
            /* Selected File Preview */
            <div
              className="p-4 border-2 border-border bg-surface-2 flex items-center justify-between gap-3"
              style={{ borderRadius: "0px" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 border border-border bg-surface flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="font-serif font-bold text-sm text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="font-mono text-xs text-muted mt-0.5">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={effectiveLoading}
                className="text-xs font-mono uppercase underline text-muted hover:text-foreground shrink-0"
              >
                Change
              </button>
            </div>
          )}

          {/* Collapsible Manual Path (Power users / Dev) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground font-mono"
            >
              {showManualInput ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span>Advanced: Enter path manually</span>
            </button>

            {showManualInput && (
              <div className="mt-2 space-y-1.5">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => {
                    setManualPath(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="e.g. C:/documents/book.pdf"
                  disabled={effectiveLoading}
                  className="w-full h-10 px-3 border border-border bg-background text-foreground font-mono text-xs placeholder:text-muted focus:outline-none focus:bg-neutral-100"
                  style={{ borderRadius: "0px" }}
                />
              </div>
            )}
          </div>

          {/* Error display */}
          {(localError || error) && (
            <div
              className="flex items-start gap-2 p-3 bg-danger/10 border border-danger text-danger text-xs font-medium"
              style={{ borderRadius: "0px" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{localError || error}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={effectiveLoading}
              className="h-10 px-4 border border-border bg-transparent text-foreground font-medium text-xs uppercase tracking-wider hover:bg-neutral-100 transition-colors"
              style={{ borderRadius: "0px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={effectiveLoading || (!selectedFile && !manualPath.trim())}
              className="h-10 px-6 bg-foreground text-background font-bold text-xs uppercase tracking-wider border border-transparent hover:bg-white hover:text-foreground hover:border-foreground disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              style={{ borderRadius: "0px" }}
            >
              {effectiveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Import Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
