import React, { useState, useEffect, useRef } from "react";
import { FileText, Copy, Check, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptic";
import { useTranslation } from "@/i18n";
import { HighlightColor } from "@/types";

export interface SelectionToolbarProps {
  position: { top: number; left: number } | null;
  selectedText: string;
  onHighlight: (color: HighlightColor) => void;
  onAddNote: (content: string) => void;
  onClose: () => void;
}

const COLORS: { id: HighlightColor; bg: string; border: string }[] = [
  { id: "yellow", bg: "bg-amber-300 dark:bg-amber-500", border: "border-amber-500" },
  { id: "green", bg: "bg-emerald-300 dark:bg-emerald-500", border: "border-emerald-500" },
  { id: "blue", bg: "bg-sky-300 dark:bg-sky-500", border: "border-sky-500" },
  { id: "pink", bg: "bg-pink-300 dark:bg-pink-500", border: "border-pink-500" },
  { id: "purple", bg: "bg-purple-300 dark:bg-purple-500", border: "border-purple-500" },
];

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  position,
  selectedText,
  onHighlight,
  onAddNote,
  onClose,
}) => {
  const { t } = useTranslation();
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsNoteOpen(false);
    setNoteContent("");
    setCopied(false);
  }, [selectedText, position]);

  if (!position || !selectedText.trim()) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleSaveNote = () => {
    if (!noteContent.trim()) return;
    onAddNote(noteContent.trim());
    setIsNoteOpen(false);
    setNoteContent("");
  };

  return (
    <div
      ref={toolbarRef}
      style={{
        position: "fixed",
        top: Math.max(10, position.top - 54),
        left: Math.max(10, Math.min(window.innerWidth - 280, position.left - 120)),
        zIndex: 100,
      }}
      className="bg-surface border-2 border-foreground shadow-[4px_4px_0px_0px_#111111] animate-in fade-in duration-150 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {!isNoteOpen ? (
        <div className="flex items-center gap-0.5 p-1">
          {/* Highlight Color Pickers with 44px touch target */}
          <div className="flex items-center border-r border-border pr-1">
            {COLORS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  triggerHaptic("tick");
                  onHighlight(col.id);
                }}
                aria-label={t("selection.highlightColor", { color: col.id })}
                title={t("selection.highlightColor", { color: col.id })}
                className="w-8 h-8 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center p-1"
              >
                <div
                  className={`w-5 h-5 border border-foreground/60 transition-transform hover:scale-125 ${col.bg}`}
                />
              </button>
            ))}
          </div>

          {/* Add Note Button */}
          <button
            type="button"
            onClick={() => setIsNoteOpen(true)}
            aria-label={t("selection.note")}
            title={t("selection.note")}
            className="flex items-center gap-1 min-h-[44px] px-2.5 py-1 text-xs font-mono uppercase text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("selection.note")}</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t("selection.copy")}
            title={t("selection.copy")}
            className="flex items-center gap-1 min-h-[44px] px-2.5 py-1 text-xs font-mono uppercase text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{copied ? t("selection.copied") : t("selection.copy")}</span>
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("selection.dismiss")}
            className="w-8 h-8 min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center text-muted hover:text-foreground transition-colors ml-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Note Inline Composer */
        <div className="p-2 w-64 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted border-b border-border pb-1">
            <span>{t("selection.marginalNote")}</span>
            <button
              type="button"
              onClick={() => setIsNoteOpen(false)}
              aria-label={t("selection.dismiss")}
              className="w-6 h-6 min-w-[36px] min-h-[36px] flex items-center justify-center text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={2}
            placeholder={t("selection.typeNote")}
            className="w-full bg-background border border-border p-1.5 text-xs font-serif text-foreground focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="flex justify-end gap-1 font-mono text-[10px] uppercase">
            <button
              type="button"
              onClick={() => setIsNoteOpen(false)}
              className="min-h-[36px] px-2.5 py-1 border border-border text-muted hover:text-foreground"
            >
              {t("selection.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSaveNote}
              className="min-h-[36px] px-2.5 py-1 bg-foreground text-background font-bold hover:bg-accent"
            >
              {t("selection.saveNote")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
