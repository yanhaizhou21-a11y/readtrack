import React, { useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Search as SearchIcon } from "lucide-react";

export const SearchScreen: React.FC = () => {
  const [query, setQuery] = useState("");

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Search" showBack />
      <div className="p-4">
        <div className="relative flex items-center">
          <SearchIcon className="w-5 h-5 absolute left-3 text-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, notes, highlights..."
            className="w-full h-11 pl-10 pr-4 rounded-control bg-surface-2 border border-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title={query.trim() ? `No matches for "${query}"` : "Search your library"}
          body={
            query.trim()
              ? "Check the spelling or try fewer words."
              : "Find documents, notes, highlights, or passages instantly."
          }
          hint="Supports title, author, content, and annotations"
        />
      </div>
    </div>
  );
};
