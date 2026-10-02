import React, { useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";

type TabKind = "bookmarks" | "highlights" | "notes";

export const AnnotationsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKind>("bookmarks");

  const tabConfig = {
    bookmarks: {
      title: "Nothing bookmarked yet.",
      body: "Save important pages or passages while reading.",
    },
    highlights: {
      title: "No highlights yet.",
      body: "Select text while reading to highlight it.",
    },
    notes: {
      title: "No notes yet.",
      body: "Long-press a passage and choose Add Note.",
    },
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Annotations" showBack />
      <div className="flex border-b border-border px-4">
        {(["bookmarks", "highlights", "notes"] as TabKind[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`py-3 px-4 text-sm font-medium border-b-2 capitalize transition-colors ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title={tabConfig[activeTab].title}
          body={tabConfig[activeTab].body}
          hint="Start reading in Library to create annotations"
        />
      </div>
    </div>
  );
};
