import React from "react";
import { MapSegment } from "@/types";

interface ReadingSpineProps {
  segments: MapSegment[];
  onSelectSegment?: (segment: MapSegment) => void;
  selectedSegmentIndex?: number | null;
}

export const ReadingSpine: React.FC<ReadingSpineProps> = ({
  segments,
  onSelectSegment,
  selectedSegmentIndex,
}) => {
  if (segments.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted">
        No segments available
      </div>
    );
  }

  const getSegmentColor = (status: string, isSelected: boolean) => {
    let base = "";
    switch (status) {
      case "read":
        base = "bg-emerald-500 text-white";
        break;
      case "reading":
        base = "bg-amber-500 text-white animate-pulse";
        break;
      case "skipped":
        base = "bg-purple-400 text-white border border-purple-500/30";
        break;
      case "unread":
      default:
        base = "bg-surface-2 text-muted-foreground border border-border/40 hover:bg-surface-3";
        break;
    }

    if (isSelected) {
      return `${base} ring-2 ring-primary ring-offset-1 ring-offset-background scale-105 z-10`;
    }
    return base;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted pb-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Read
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Reading
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-purple-400" /> Skipped
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-surface-2 border border-border/40" /> Unread
        </span>
      </div>

      {/* Grid of segments */}
      <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-16 gap-1.5 py-1">
        {segments.map((seg) => {
          const isSelected = selectedSegmentIndex === seg.index;
          return (
            <button
              key={seg.index}
              type="button"
              onClick={() => onSelectSegment?.(seg)}
              aria-label={`Segment ${seg.index + 1}: ${seg.status}, ${seg.wordCount} words`}
              className={`h-7 rounded-sm flex items-center justify-center font-mono text-[10px] font-medium transition-all ${getSegmentColor(
                seg.status,
                isSelected
              )}`}
            >
              {seg.index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
};
