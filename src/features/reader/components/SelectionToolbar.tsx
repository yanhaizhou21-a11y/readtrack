import React, { useState, useEffect, useRef } from "react";
import { FileText, Copy, Check, X } from "lucide-react";
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
        <div className="flex items-center gap-1 p-1">
          {/* Highlight Color Pickers */}
          <div className="flex items-center gap-1 px-1 border-r border-border">
            {COLORS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => onHighlight(col.id)}
                title={`Highlight in ${col.id}`}
                className={`w-5 h-5 border border-foreground/60 transition-transform hover:scale-125 ${col.bg}`}
              />
            ))}
          </div>

          {/* Add Note Button */}
          <button
            type="button"
            onClick={() => setIsNoteOpen(true)}
            title="Attach Note"
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono uppercase text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Note</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy passage"
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono uppercase text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss selection"
            className="p-1 text-muted hover:text-foreground transition-colors ml-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Note Inline Composer */
        <div className="p-2 w-64 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted border-b border-border pb-1">
            <span>Marginal Note</span>
            <button
              type="button"
              onClick={() => setIsNoteOpen(false)}
              className="text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={2}
            placeholder="Type note on passage..."
            className="w-full bg-background border border-border p-1.5 text-xs font-serif text-foreground focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="flex justify-end gap-1 font-mono text-[10px] uppercase">
            <button
              type="button"
              onClick={() => setIsNoteOpen(false)}
              className="px-2 py-1 border border-border text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNote}
              className="px-2 py-1 bg-foreground text-background font-bold hover:bg-accent"
            >
              Save Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
