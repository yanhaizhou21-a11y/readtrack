import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Search } from "lucide-react";
import { listDocuments } from "@/features/library/api/documents";

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [recentDocId, setRecentDocId] = useState<string | null>(null);

  useEffect(() => {
    listDocuments({ limit: 1, sort: "recent_opened" })
      .then((res) => {
        if (res.items && res.items.length > 0 && res.items[0]) {
          setRecentDocId(res.items[0].id);
        }
      })
      .catch((err) => console.error("Failed to fetch recent doc", err));
  }, []);

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
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <EmptyState
          title="Welcome to ReadTrack"
          body="Import a document to begin. Everything stays on your device."
          primaryAction={{
            label: "Open Library",
            onClick: () => navigate("/library"),
          }}
          hint="PDF · DOCX · EPUB · RTF · TXT · Markdown"
        />
        {recentDocId && (
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
            onClick={() => navigate(`/read/${recentDocId}`)}
          >
            Continue Reading
          </button>
        )}
      </div>
    </div>
  );
};
