import React from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";

export const TrackerScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Reading Tracker" />
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title="Your reading map is waiting."
          body="Open a document and your reading progress will appear here automatically."
          primaryAction={{
            label: "Open Library",
            onClick: () => navigate("/library"),
          }}
        />
      </div>
    </div>
  );
};
