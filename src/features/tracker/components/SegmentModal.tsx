import React from "react";
import { MapSegment } from "@/types";
import { X, Play, Clock, FileText } from "lucide-react";
import { useTranslation } from "@/i18n";

interface SegmentModalProps {
  segment: MapSegment | null;
  onClose: () => void;
  onContinueReading?: (segment: MapSegment) => void;
}

export const SegmentModal: React.FC<SegmentModalProps> = ({
  segment,
  onClose,
  onContinueReading,
}) => {
  const { t } = useTranslation();
  if (!segment) return null;

  const estSeconds = Math.max(1, Math.round((segment.wordCount / 250) * 60));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface rounded-sheet sm:rounded-card border border-border p-5 shadow-xl flex flex-col gap-4 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-base text-foreground">
              {t("segment.title", { index: segment.index + 1 })}
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full uppercase tracking-wider ${
                segment.status === "read"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : segment.status === "reading"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : segment.status === "skipped"
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  : "bg-muted/10 text-muted"
              }`}
            >
              {segment.status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
            aria-label={t("segment.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="p-3 rounded-lg bg-surface-2/60 border border-border/40 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted">{t("segment.length")}</div>
              <div className="text-sm font-semibold font-mono text-foreground">
                {t("segment.words", { count: segment.wordCount })}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface-2/60 border border-border/40 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-xs text-muted">{t("segment.estTime")}</div>
              <div className="text-sm font-semibold font-mono text-foreground">
                {estSeconds}s
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={() => {
            onContinueReading?.(segment);
            onClose();
          }}
          className="w-full h-11 min-h-[44px] rounded-control bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Play className="w-4 h-4 fill-current" />
          {t("segment.continueHere")}
        </button>
      </div>
    </div>
  );
};
