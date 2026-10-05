import React, { useState, useEffect, useCallback } from "react";
import { SectionPayload, ReadingMap, Block, LogicalPosition, HighlightColor, Highlight } from "@/types";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { createHighlight, createNote, listHighlights } from "@/features/annotations/api";

export interface RichReaderProps {
  documentId: string;
  sections: SectionPayload[];
  readingMap: ReadingMap | null;
  currentPosition?: LogicalPosition | null;
  containerRef?: React.Ref<HTMLDivElement>;
  onAnnotationCreated?: () => void;
}

export const RichReader: React.FC<RichReaderProps> = ({
  documentId,
  sections,
  readingMap,
  currentPosition,
  containerRef,
  onAnnotationCreated,
}) => {
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  // Fetch highlights for document
  const fetchDocHighlights = useCallback(async () => {
    if (!documentId) return;
    try {
      const list = await listHighlights(documentId);
      setHighlights(list);
    } catch (err) {
      console.error("Failed to fetch reader highlights:", err);
    }
  }, [documentId]);

  useEffect(() => {
    fetchDocHighlights();
  }, [fetchDocHighlights]);

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setToolbarPos(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      setToolbarPos(null);
      setSelectedText("");
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setToolbarPos({
          top: rect.top,
          left: rect.left + rect.width / 2,
        });
        setSelectedText(text);
      }
    } catch {
      setToolbarPos(null);
      setSelectedText("");
    }
  };

  const handleHighlight = async (color: HighlightColor) => {
    if (!documentId || !selectedText) return;
    const basePos = currentPosition ?? {
      documentId,
      percentage: 0,
      parserVersion: 1,
    };

    try {
      const newHl = await createHighlight({
        documentId,
        start: basePos,
        end: basePos,
        selectedText,
        color,
      });
      setHighlights((prev) => [newHl, ...prev]);
      setToolbarPos(null);
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
      if (onAnnotationCreated) onAnnotationCreated();
    } catch (err) {
      console.error("Failed to create highlight:", err);
    }
  };

  const handleAddNote = async (content: string) => {
    if (!documentId || !content.trim()) return;
    const basePos = currentPosition ?? {
      documentId,
      percentage: 0,
      parserVersion: 1,
    };

    try {
      await createNote({
        documentId,
        position: basePos,
        content: content.trim(),
      });
      setToolbarPos(null);
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
      if (onAnnotationCreated) onAnnotationCreated();
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  };

  const handleCloseToolbar = () => {
    setToolbarPos(null);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  };

  const renderBlock = (block: Block) => {
    switch (block.type) {
      case "heading": {
        const level = block.level || 2;
        if (level === 1) {
          return (
            <h1
              key={block.id}
              className="font-serif font-bold text-2xl text-foreground mt-6 mb-3 tracking-tight"
            >
              {block.text}
            </h1>
          );
        }
        if (level === 2) {
          return (
            <h2
              key={block.id}
              className="font-serif font-bold text-xl text-foreground mt-5 mb-2.5"
            >
              {block.text}
            </h2>
          );
        }
        return (
          <h3
            key={block.id}
            className="font-serif font-semibold text-lg text-foreground mt-4 mb-2"
          >
            {block.text}
          </h3>
        );
      }
      case "quote":
        return (
          <blockquote
            key={block.id}
            className="border-l-2 border-primary pl-4 italic text-muted my-3 font-serif"
          >
            {block.text}
          </blockquote>
        );
      case "code":
        return (
          <pre
            key={block.id}
            className="bg-surface-2 p-3 font-mono text-xs overflow-x-auto my-3 text-foreground border border-border"
          >
            <code>{block.text}</code>
          </pre>
        );
      case "separator":
        return <hr key={block.id} className="my-6 border-border" />;
      case "list":
        return (
          <div key={block.id} className="flex items-start gap-2 my-1.5 pl-2">
            <span className="text-primary select-none font-bold">•</span>
            <span className="font-serif text-base text-foreground/90 leading-relaxed">
              {block.text}
            </span>
          </div>
        );
      case "paragraph":
      default:
        return (
          <p
            key={block.id}
            className="font-serif text-base leading-relaxed text-foreground/90 my-3"
          >
            {block.text}
          </p>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseUp={handleSelection}
      onTouchEnd={handleSelection}
      className="flex-1 overflow-y-auto px-5 py-6 max-w-prose mx-auto w-full select-text relative"
      data-testid="rich-reader-container"
    >
      {/* Floating Selection Toolbar */}
      <SelectionToolbar
        position={toolbarPos}
        selectedText={selectedText}
        onHighlight={handleHighlight}
        onAddNote={handleAddNote}
        onClose={handleCloseToolbar}
      />

      {highlights.length > 0 && (
        <div className="text-[10px] font-mono uppercase text-muted mb-4 pb-1 border-b border-border/40 flex items-center justify-between">
          <span>HIGHLIGHTED PASSAGES IN DOCUMENT: {highlights.length}</span>
        </div>
      )}

      {sections.map((section) => {
        // Find matching section in reading map to get segments
        const mapSection = readingMap?.sections.find(
          (s) => s.sectionId === section.id || s.index === section.index
        );

        const segments = mapSection?.segments ?? [];

        // If there are segments, partition the section blocks across segments
        if (segments.length > 0 && section.blocks.length > 0) {
          const blocksPerSegment = Math.max(
            1,
            Math.ceil(section.blocks.length / segments.length)
          );

          return (
            <div key={section.id} className="mb-8" data-section-index={section.index}>
              {section.title && (
                <div className="text-xs font-mono uppercase tracking-wider text-muted mb-4 border-b border-border pb-1">
                  {section.title}
                </div>
              )}
              {segments.map((seg, segIdx) => {
                const startIdx = segIdx * blocksPerSegment;
                const segBlocks = section.blocks.slice(
                  startIdx,
                  startIdx + blocksPerSegment
                );

                if (segBlocks.length === 0) return null;

                return (
                  <div
                    key={seg.index}
                    data-segment-index={seg.index}
                    className="segment-block transition-colors"
                  >
                    {segBlocks.map((b) => renderBlock(b))}
                  </div>
                );
              })}
            </div>
          );
        }

        // Fallback: render section blocks directly
        return (
          <div key={section.id} className="mb-8" data-section-index={section.index}>
            {section.title && (
              <div className="text-xs font-mono uppercase tracking-wider text-muted mb-4 border-b border-border pb-1">
                {section.title}
              </div>
            )}
            <div data-segment-index={section.index}>
              {section.blocks.map((b) => renderBlock(b))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
