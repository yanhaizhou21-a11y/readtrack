import React from "react";
import { SectionPayload, ReadingMap, Block } from "@/types";

export interface RichReaderProps {
  sections: SectionPayload[];
  readingMap: ReadingMap | null;
  containerRef?: React.Ref<HTMLDivElement>;
}

export const RichReader: React.FC<RichReaderProps> = ({
  sections,
  readingMap,
  containerRef,
}) => {
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
            className="bg-surface-2 p-3 rounded font-mono text-xs overflow-x-auto my-3 text-foreground"
          >
            <code>{block.text}</code>
          </pre>
        );
      case "separator":
        return <hr key={block.id} className="my-6 border-border/60" />;
      case "list":
        return (
          <div key={block.id} className="flex items-start gap-2 my-1.5 pl-2">
            <span className="text-primary select-none">•</span>
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
      className="flex-1 overflow-y-auto px-5 py-6 max-w-prose mx-auto w-full select-text"
      data-testid="rich-reader-container"
    >
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
                <div className="text-xs font-mono uppercase tracking-wider text-muted mb-4 border-b border-border/40 pb-1">
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
              <div className="text-xs font-mono uppercase tracking-wider text-muted mb-4 border-b border-border/40 pb-1">
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
