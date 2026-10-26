import React from "react";
import { Sparkles, Download, X } from "lucide-react";
import { ReleaseInfo } from "./types";
import { openUpdateDownload } from "./api";

interface UpdateModalProps {
  release: ReleaseInfo;
  currentVersion: string;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  release,
  currentVersion,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleUpdate = () => {
    if (release.downloadUrl) {
      openUpdateDownload(release.downloadUrl);
    } else {
      openUpdateDownload(release.releaseUrl);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface border-2 border-border shadow-2xl p-6 flex flex-col gap-4 text-foreground animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-accent/15 text-accent border border-accent/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-foreground">
                Pembaruan Tersedia
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-semibold">
                  {release.version}
                </span>
                <span className="font-mono text-xs text-muted">
                  (Saat ini: v{currentVersion})
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title */}
        {release.title && release.title !== release.version && (
          <p className="font-serif text-sm font-semibold text-foreground/90 -mt-1">
            {release.title}
          </p>
        )}

        {/* Changelog Box */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted font-bold">
            Catatan Perubahan (Changelog)
          </span>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-background/60 border border-border/80 p-3.5 text-xs text-foreground/80 font-sans leading-relaxed whitespace-pre-wrap select-text">
            {release.changelog || "Pembaruan performa dan perbaikan bug sistem."}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2 px-3 rounded-xl border border-border text-foreground font-medium text-xs hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40 transition-colors"
          >
            Nanti Saja
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-accent text-accent-foreground font-bold text-xs hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Perbarui Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
};
