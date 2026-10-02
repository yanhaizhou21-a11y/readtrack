import React from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Search } from "lucide-react";

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();

  const searchAction = (
    <button
      type="button"
      onClick={() => navigate("/search")}
      aria-label="Search documents"
      className="w-10 h-10 rounded-control flex items-center justify-center text-foreground hover:bg-surface-2 transition-colors"
    >
      <Search className="w-5 h-5 text-muted" />
    </button>
  );

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="ReadTrack"
        subtitle="Local-first reading tracker"
        actions={searchAction}
      />
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title="Welcome to ReadTrack"
          body="Import a document to begin. Everything stays on your device."
          primaryAction={{
            label: "Open Library",
            onClick: () => navigate("/library"),
          }}
          hint="PDF · DOCX · EPUB · RTF · TXT · Markdown"
        />
      </div>
    </div>
  );
};
