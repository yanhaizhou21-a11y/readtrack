import React from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, MoreVertical, Archive, ArchiveRestore, Edit3, Trash2, Info } from "lucide-react";
import type { DocumentSummary } from "@/types";

export interface DocCardProps {
  document: DocumentSummary;
  viewMode: "grid" | "list";
  onRename: (doc: DocumentSummary) => void;
  onArchive: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
}

export const DocCard: React.FC<DocCardProps> = ({
  document: doc,
  viewMode,
  onRename,
  onArchive,
  onDelete,
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => window.removeEventListener("click", handleClickOutside);
  }, [menuOpen]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const progressPercent = Math.round(doc.progress * 100);

  const getFormatColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return "bg-danger/10 text-danger border-danger/20";
      case "md":
      case "markdown":
        return "bg-accent/10 text-accent border-accent/20";
      case "epub":
        return "bg-success/10 text-success border-success/20";
      default:
        return "bg-muted/20 text-muted border-muted/30";
    }
  };

  const handleCardClick = () => {
    navigate(`/read/${doc.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative bg-card border border-border rounded-container transition-all hover:border-accent/40 hover:shadow-card cursor-pointer ${
        viewMode === "grid"
          ? "flex flex-col p-4"
          : "flex flex-row items-center p-3 gap-3"
      }`}
      data-testid={`doc-card-${doc.id}`}
    >
      {/* Icon / Thumbnail Box */}
      <div
        className={`flex items-center justify-center rounded-control bg-secondary text-muted flex-shrink-0 ${
          viewMode === "grid" ? "w-full h-32 mb-3" : "w-12 h-14"
        }`}
      >
        <BookOpen className={viewMode === "grid" ? "w-10 h-10 stroke-[1.5]" : "w-6 h-6 stroke-[1.5]"} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <h3
            className="font-serif font-semibold text-foreground text-sm leading-snug line-clamp-2"
            title={doc.title}
          >
            {doc.title}
          </h3>

          {/* Menu button */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              aria-label="Document options"
              className="p-1 rounded-control text-muted hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-container shadow-overlay py-1 z-30 animate-in fade-in"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/library/${doc.id}`);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary text-left"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>View Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename(doc);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary text-left"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive(doc);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary text-left"
                >
                  {doc.isArchived ? (
                    <>
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Unarchive</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archive</span>
                    </>
                  )}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(doc);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-danger/10 text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {doc.author && (
          <p className="text-xs text-muted truncate mt-0.5" title={doc.author}>
            {doc.author}
          </p>
        )}

        {/* Metadata badges */}
        <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-muted">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase border ${getFormatColor(
              doc.fileType
            )}`}
          >
            {doc.fileType}
          </span>
          <span>{formatFileSize(doc.fileSize)}</span>
          {doc.wordCount && doc.wordCount > 0 ? (
            <span>· {doc.wordCount.toLocaleString()} words</span>
          ) : doc.pageCount && doc.pageCount > 0 ? (
            <span>· {doc.pageCount} pages</span>
          ) : (
            <span>· {doc.sectionCount} sections</span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between items-center text-[10px] text-muted mb-1">
            <span>{doc.completed ? "Completed" : `${progressPercent}% read`}</span>
          </div>
          <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                doc.completed ? "bg-success" : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
