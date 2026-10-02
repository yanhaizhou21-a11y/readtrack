import React from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Plus } from "lucide-react";

export const LibraryScreen: React.FC = () => {
  const handleImportClick = () => {
    // In Phase 1, import dialog will be wired in Phase 2
    alert("Import will be available in Phase 2 (Library & Parser implementation).");
  };

  const importAction = (
    <button
      type="button"
      onClick={handleImportClick}
      aria-label="Import document"
      className="flex items-center gap-1.5 h-9 px-3 rounded-control bg-accent text-accent-foreground text-sm font-medium hover:opacity-95 transition-opacity"
    >
      <Plus className="w-4 h-4" />
      <span>Import</span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Library" actions={importAction} />
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title="Your reading library is empty."
          body="Bring your first document here and start tracking your reading journey."
          primaryAction={{
            label: "Import Document",
            onClick: handleImportClick,
          }}
          hint="PDF · DOCX · EPUB · RTF · TXT · Markdown"
        />
      </div>
    </div>
  );
};
