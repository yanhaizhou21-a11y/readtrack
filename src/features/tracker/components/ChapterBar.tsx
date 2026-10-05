import React from "react";
import { MapSection } from "@/types";
import { CheckCircle2, BookOpen, Circle } from "lucide-react";

interface ChapterBarProps {
  section: MapSection;
  onClick?: (section: MapSection) => void;
  isActive?: boolean;
}

export const ChapterBar: React.FC<ChapterBarProps> = ({
  section,
  onClick,
  isActive = false,
}) => {
  const percent = Math.round(section.progress * 100);

  const getStatusIcon = () => {
    if (section.status === "read" || percent >= 98) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (section.status === "reading" || percent > 0) {
      return <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    return <Circle className="w-4 h-4 text-muted/40 shrink-0" />;
  };

  const getStatusBadge = () => {
    if (section.status === "read" || percent >= 98) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          Completed
        </span>
      );
    }
    if (section.status === "reading" || percent > 0) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          In Progress
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted/10 text-muted">
        Unread
      </span>
    );
  };

  return (
    <div
      onClick={() => onClick?.(section)}
      className={`p-3.5 rounded-card border transition-all cursor-pointer ${
        isActive
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/60 bg-surface hover:bg-surface-2"
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick?.(section);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon()}
          <span className="font-medium text-sm text-foreground truncate">
            {section.title || `Section ${section.index + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {getStatusBadge()}
          <span className="font-mono text-xs font-semibold text-foreground min-w-[36px] text-right">
            {percent}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            percent >= 98
              ? "bg-emerald-500"
              : percent > 0
              ? "bg-amber-500"
              : "bg-transparent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Section segments count & read time */}
      <div className="flex justify-between items-center mt-2 text-xs text-muted font-mono">
        <span>{section.segments.length} segments</span>
        {section.readMs > 0 && (
          <span>{Math.round(section.readMs / 1000)}s reading time</span>
        )}
      </div>
    </div>
  );
};
