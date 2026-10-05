import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search as SearchIcon,
  X,
  BookOpen,
  FileText,
  Highlighter,
  Bookmark,
  ExternalLink,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { searchDocuments } from "./api";
import { listDocuments } from "@/features/library/api/documents";
import { SearchHit, DocumentSummary } from "@/types";

type ScopeOption = "all" | "document" | "content" | "note" | "highlight" | "bookmark";

const SCOPE_CONFIG: { id: ScopeOption; label: string }[] = [
  { id: "all", label: "All Archives" },
  { id: "document", label: "Titles" },
  { id: "content", label: "Content" },
  { id: "note", label: "Notes" },
  { id: "highlight", label: "Highlights" },
  { id: "bookmark", label: "Bookmarks" },
];

export const SearchScreen: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<ScopeOption>("all");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("all");

  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load document list for publication filter
  useEffect(() => {
    listDocuments({ limit: 100 })
      .then((res) => setDocuments(res.items))
      .catch(console.error);
  }, []);

  const executeSearch = useCallback(
    async (searchQuery: string, scope: ScopeOption, docId: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setResults([]);
        setLoading(false);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      try {
        const scopeParam = scope === "all" ? undefined : [scope];
        const docParam = docId === "all" ? undefined : docId;

        const hits = await searchDocuments({
          query: trimmed,
          scope: scopeParam,
          documentId: docParam,
          limit: 100,
        });
        setResults(hits);
        setHasSearched(true);
      } catch (err) {
        console.error("Search query failed:", err);
        setResults([]);
        setHasSearched(true);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search on input change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(query, selectedScope, selectedDocId);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, selectedScope, selectedDocId, executeSearch]);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
  };

  const handleJumpToResult = (hit: SearchHit) => {
    navigate(`/read/${hit.documentId}`);
  };

  const renderKindIcon = (kind: string) => {
    switch (kind) {
      case "note":
        return <FileText className="w-3.5 h-3.5 text-accent" />;
      case "highlight":
        return <Highlighter className="w-3.5 h-3.5 text-accent" />;
      case "bookmark":
        return <Bookmark className="w-3.5 h-3.5 text-accent" />;
      case "title":
      case "author":
      case "content":
      default:
        return <BookOpen className="w-3.5 h-3.5 text-accent" />;
    }
  };

  const formatKindLabel = (kind: string) => {
    switch (kind) {
      case "title":
        return "TITLE MATCH";
      case "author":
        return "AUTHOR MATCH";
      case "content":
        return "PASSAGE";
      case "note":
        return "EDITORIAL NOTE";
      case "highlight":
        return "HIGHLIGHT";
      case "bookmark":
        return "BOOKMARK";
      default:
        return kind.toUpperCase();
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-16 bg-background text-foreground select-none">
      <Header
        title="SEARCH"
        subtitle="FULL ARCHIVE DISPATCH INQUIRY"
        showBack
      />

      {/* Search Input Bar */}
      <div className="p-4 border-b-2 border-border bg-surface">
        <div className="relative flex items-center mb-3">
          <SearchIcon className="w-5 h-5 absolute left-3.5 text-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type query to scan text, notes, & marks..."
            className="w-full h-12 pl-11 pr-10 border-2 border-foreground bg-background text-foreground font-serif text-base placeholder:text-muted placeholder:font-sans placeholder:text-sm focus:outline-none focus:border-accent"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear query"
              className="absolute right-3 p-1 text-muted hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scope selector buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono scrollbar-none">
          {SCOPE_CONFIG.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setSelectedScope(sc.id)}
              className={`px-2.5 py-1 uppercase whitespace-nowrap transition-colors border ${
                selectedScope === sc.id
                  ? "bg-foreground text-background border-foreground font-bold"
                  : "bg-background text-muted border-border hover:text-foreground hover:border-foreground"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>

        {/* Document filter dropdown */}
        {documents.length > 1 && (
          <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between text-xs font-mono">
            <span className="text-muted uppercase text-[10px]">Filter Publication:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="bg-transparent border border-border px-2 py-0.5 text-foreground focus:outline-none focus:border-accent text-xs font-mono max-w-[200px] truncate"
            >
              <option value="all">ALL PUBLICATIONS ({documents.length})</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Results View */}
      <div className="flex-1 p-4 max-w-xl mx-auto w-full">
        {loading ? (
          <div className="space-y-3">
            <div className="h-6 w-36 bg-surface-2 animate-pulse mb-3" />
            <LoadingSkeleton className="h-24 w-full" count={4} />
          </div>
        ) : !query.trim() ? (
          <div className="py-12">
            <EmptyState
              title="Search Publication Archives"
              body="Query full-text contents, marginalia notes, citations, and highlights across all stored works."
              hint="Indexed locally with SQLite FTS5 for instant offline search"
            />
          </div>
        ) : results.length === 0 && hasSearched ? (
          <div className="py-12">
            <EmptyState
              title={`No dispatches found for "${query}"`}
              body="Examine query spelling or select 'All Archives' to broaden your search."
              hint="Check active filters or search by key fragments"
            />
          </div>
        ) : (
          <div>
            {/* Editorial Results Stat Line */}
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3 font-mono text-[11px] uppercase tracking-wider text-muted">
              <span>
                Found <strong className="text-foreground">{results.length}</strong> {results.length === 1 ? "Dispatch" : "Dispatches"}
              </span>
              <span>QUERY: "{query}"</span>
            </div>

            {/* List of Search Hits */}
            <div className="space-y-3">
              {results.map((hit, idx) => (
                <div
                  key={`${hit.documentId}-${hit.refId || idx}`}
                  onClick={() => handleJumpToResult(hit)}
                  className="border border-border p-3.5 bg-surface hard-shadow-hover cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {renderKindIcon(hit.kind)}
                      <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold">
                        {formatKindLabel(hit.kind)}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted">
                      {hit.page ? `PAGE ${hit.page}` : `${Math.round(hit.position.percentage * 100)}%`}
                    </span>
                  </div>

                  {/* Document and section header */}
                  <div className="mb-2">
                    <h3 className="font-serif font-black text-sm text-foreground leading-snug line-clamp-1">
                      {hit.documentTitle}
                    </h3>
                    {hit.sectionTitle && (
                      <p className="font-mono text-[10px] uppercase text-muted tracking-wide truncate">
                        Section: {hit.sectionTitle}
                      </p>
                    )}
                  </div>

                  {/* Match Snippet with highlighted words */}
                  <div className="font-serif text-sm leading-relaxed text-foreground/90 border-l-2 border-foreground/30 pl-2.5 py-1 my-1.5 bg-neutral-100/50 dark:bg-neutral-800/50">
                    {hit.snippet.map((part, pIdx) =>
                      part.match ? (
                        <mark
                          key={pIdx}
                          className="bg-accent/15 text-accent font-bold px-0.5 border-b border-accent"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={pIdx}>{part.text}</span>
                      )
                    )}
                  </div>

                  <div className="flex justify-end mt-2 pt-2 border-t border-border/30">
                    <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-foreground font-bold hover:text-accent transition-colors">
                      <span>Inspect Passage</span>
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
