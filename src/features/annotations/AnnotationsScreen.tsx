import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark as BookmarkIcon,
  Highlighter,
  FileText,
  Trash2,
  Edit3,
  ExternalLink,
  Filter,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import {
  listBookmarks,
  deleteBookmark,
  updateBookmark,
  listHighlights,
  deleteHighlight,
  updateHighlight,
  listNotes,
  deleteNote,
  updateNote,
} from "./api";
import { listDocuments } from "@/features/library/api/documents";
import {
  Bookmark,
  Highlight,
  Note,
  DocumentSummary,
} from "@/types";

type TabKind = "bookmarks" | "highlights" | "notes";

export const AnnotationsScreen: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKind>("bookmarks");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("all");

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal states
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editBmTitle, setEditBmTitle] = useState("");
  const [editBmNote, setEditBmNote] = useState("");

  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [editHlNote, setEditHlNote] = useState("");
  const [editHlColor, setEditHlColor] = useState("yellow");

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");

  // Delete confirm state
  const [itemToDelete, setItemToDelete] = useState<{
    type: "bookmark" | "highlight" | "note";
    id: string;
    title: string;
  } | null>(null);

  // Toast undo notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docFilter = selectedDocId === "all" ? undefined : selectedDocId;
      const [docsRes, bms, hls, nts] = await Promise.all([
        listDocuments({ limit: 100 }),
        listBookmarks(docFilter),
        listHighlights(docFilter),
        listNotes(docFilter),
      ]);
      setDocuments(docsRes.items);
      setBookmarks(bms);
      setHighlights(hls);
      setNotes(nts);
    } catch (err) {
      console.error("Failed to load annotations:", err);
      setError("Failed to load annotations from database.");
    } finally {
      setLoading(false);
    }
  }, [selectedDocId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lookup document title helper
  const getDocTitle = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    return doc ? doc.title : "Document";
  };

  // Format date helper
  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // --- Bookmark actions ---
  const handleOpenEditBookmark = (bm: Bookmark) => {
    setEditingBookmark(bm);
    setEditBmTitle(bm.title || "");
    setEditBmNote(bm.note || "");
  };

  const handleSaveBookmark = async () => {
    if (!editingBookmark) return;
    try {
      const updated = await updateBookmark({
        id: editingBookmark.id,
        title: editBmTitle.trim() || undefined,
        note: editBmNote.trim() || undefined,
      });
      setBookmarks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setEditingBookmark(null);
      showToast("Bookmark updated");
    } catch (err) {
      console.error("Failed to update bookmark:", err);
    }
  };

  // --- Highlight actions ---
  const handleOpenEditHighlight = (hl: Highlight) => {
    setEditingHighlight(hl);
    setEditHlNote(hl.note || "");
    setEditHlColor(hl.color);
  };

  const handleSaveHighlight = async () => {
    if (!editingHighlight) return;
    try {
      const updated = await updateHighlight({
        id: editingHighlight.id,
        note: editHlNote.trim() || undefined,
        color: editHlColor,
      });
      setHighlights((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      setEditingHighlight(null);
      showToast("Highlight updated");
    } catch (err) {
      console.error("Failed to update highlight:", err);
    }
  };

  // --- Note actions ---
  const handleOpenEditNote = (n: Note) => {
    setEditingNote(n);
    setEditNoteContent(n.content);
  };

  const handleSaveNote = async () => {
    if (!editingNote || !editNoteContent.trim()) return;
    try {
      const updated = await updateNote({
        id: editingNote.id,
        content: editNoteContent.trim(),
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingNote(null);
      showToast("Note updated");
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  };

  // --- Delete execution ---
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === "bookmark") {
        await deleteBookmark(itemToDelete.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== itemToDelete.id));
        showToast("Bookmark deleted");
      } else if (itemToDelete.type === "highlight") {
        await deleteHighlight(itemToDelete.id);
        setHighlights((prev) => prev.filter((h) => h.id !== itemToDelete.id));
        showToast("Highlight deleted");
      } else if (itemToDelete.type === "note") {
        await deleteNote(itemToDelete.id);
        setNotes((prev) => prev.filter((n) => n.id !== itemToDelete.id));
        showToast("Note deleted");
      }
    } catch (err) {
      console.error("Failed to delete annotation:", err);
    } finally {
      setItemToDelete(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleJumpToReader = (documentId: string) => {
    navigate(`/read/${documentId}`);
  };

  const renderColorPill = (color: string) => {
    const bgMap: Record<string, string> = {
      yellow: "bg-amber-300 dark:bg-amber-500",
      green: "bg-emerald-300 dark:bg-emerald-500",
      blue: "bg-sky-300 dark:bg-sky-500",
      pink: "bg-pink-300 dark:bg-pink-500",
      purple: "bg-purple-300 dark:bg-purple-500",
      orange: "bg-orange-300 dark:bg-orange-500",
    };
    return (
      <span
        className={`inline-block w-2.5 h-2.5 mr-1.5 border border-border ${
          bgMap[color] || "bg-amber-300"
        }`}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col pb-16 bg-background text-foreground select-none">
      <Header
        title="ANNOTATIONS"
        subtitle="DISPATCHES & CLIPPINGS"
        showBack
      />

      {/* Filter and Tab Section */}
      <div className="border-b-2 border-border bg-surface">
        {/* Document Filter Selector */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 text-muted uppercase">
            <Filter className="w-3.5 h-3.5" />
            <span>Document:</span>
          </div>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="bg-transparent border border-border px-2 py-1 text-foreground focus:outline-none focus:border-accent text-xs font-mono max-w-[200px] truncate"
          >
            <option value="all">ALL PUBLICATIONS ({documents.length})</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-stretch text-center font-mono text-xs uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setActiveTab("bookmarks")}
            className={`flex-1 py-3 px-2 border-r border-border flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "bookmarks"
                ? "bg-foreground text-background font-bold"
                : "text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <BookmarkIcon className="w-3.5 h-3.5" />
            <span>Bookmarks</span>
            <span className="text-[10px] opacity-80">({bookmarks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("highlights")}
            className={`flex-1 py-3 px-2 border-r border-border flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "highlights"
                ? "bg-foreground text-background font-bold"
                : "text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>Highlights</span>
            <span className="text-[10px] opacity-80">({highlights.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`flex-1 py-3 px-2 flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "notes"
                ? "bg-foreground text-background font-bold"
                : "text-muted hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes</span>
            <span className="text-[10px] opacity-80">({notes.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 max-w-xl mx-auto w-full">
        {loading ? (
          <div className="space-y-3">
            <LoadingSkeleton className="h-20 w-full" count={3} />
          </div>
        ) : error ? (
          <div className="border-2 border-accent p-4 text-center my-6">
            <AlertCircle className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="font-serif text-sm font-bold text-foreground mb-1">
              Error Loading Annotations
            </p>
            <p className="font-mono text-xs text-muted mb-3">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 border border-border text-xs font-mono uppercase bg-foreground text-background"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* BOOKMARKS TAB */}
            {activeTab === "bookmarks" && (
              bookmarks.length === 0 ? (
                <EmptyState
                  title="No Bookmarks Filed"
                  body="Place markers in any article to return to your reading dispatch instantly."
                  hint="Tap the Bookmark icon in the reader navigation bar"
                />
              ) : (
                <div className="space-y-3">
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="border border-border p-3.5 bg-surface hard-shadow-hover transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold block truncate">
                            {getDocTitle(bm.documentId)}
                          </span>
                          <h3 className="font-serif font-bold text-base text-foreground leading-snug line-clamp-1">
                            {bm.title || bm.excerpt || "Untitled Bookmark"}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditBookmark(bm)}
                            aria-label="Edit bookmark"
                            className="p-1 text-muted hover:text-foreground border border-transparent hover:border-border transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItemToDelete({
                                type: "bookmark",
                                id: bm.id,
                                title: bm.title || bm.excerpt || "Bookmark",
                              })
                            }
                            aria-label="Delete bookmark"
                            className="p-1 text-muted hover:text-accent border border-transparent hover:border-border transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {bm.excerpt && bm.title && (
                        <p className="font-serif text-xs text-muted/90 italic border-l-2 border-border pl-2 my-1.5 line-clamp-2">
                          "{bm.excerpt}"
                        </p>
                      )}

                      {bm.note && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-2 text-xs font-mono text-foreground/90 my-2 border border-border/50">
                          <span className="text-[10px] uppercase font-bold text-muted block mb-0.5">Note:</span>
                          {bm.note}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[10px] font-mono text-muted">
                        <div className="flex items-center gap-3">
                          <span>{formatDate(bm.createdAt)}</span>
                          {bm.page ? (
                            <span>PAGE {bm.page}</span>
                          ) : (
                            <span>{Math.round(bm.position.percentage * 100)}%</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJumpToReader(bm.documentId)}
                          className="flex items-center gap-1 text-foreground font-bold hover:text-accent uppercase transition-colors"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* HIGHLIGHTS TAB */}
            {activeTab === "highlights" && (
              highlights.length === 0 ? (
                <EmptyState
                  title="No Highlights Recorded"
                  body="Select text passages while reading to file and highlight notable excerpts."
                  hint="Long-press or select text in reader to highlight"
                />
              ) : (
                <div className="space-y-3">
                  {highlights.map((hl) => (
                    <div
                      key={hl.id}
                      className="border border-border p-3.5 bg-surface hard-shadow-hover transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            {renderColorPill(hl.color)}
                            <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold truncate">
                              {getDocTitle(hl.documentId)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditHighlight(hl)}
                            aria-label="Edit highlight"
                            className="p-1 text-muted hover:text-foreground border border-transparent hover:border-border transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItemToDelete({
                                type: "highlight",
                                id: hl.id,
                                title: hl.selectedText,
                              })
                            }
                            aria-label="Delete highlight"
                            className="p-1 text-muted hover:text-accent border border-transparent hover:border-border transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <blockquote className="font-serif text-sm leading-relaxed text-foreground border-l-2 border-foreground pl-3 py-1 my-1.5 bg-neutral-100/40 dark:bg-neutral-800/40">
                        "{hl.selectedText}"
                      </blockquote>

                      {hl.note && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-2 text-xs font-mono text-foreground/90 my-2 border border-border/50">
                          <span className="text-[10px] uppercase font-bold text-muted block mb-0.5">Note:</span>
                          {hl.note}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[10px] font-mono text-muted">
                        <div className="flex items-center gap-3">
                          <span>{formatDate(hl.createdAt)}</span>
                          {hl.page ? (
                            <span>PAGE {hl.page}</span>
                          ) : (
                            <span>{Math.round(hl.positionStart.percentage * 100)}%</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJumpToReader(hl.documentId)}
                          className="flex items-center gap-1 text-foreground font-bold hover:text-accent uppercase transition-colors"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* NOTES TAB */}
            {activeTab === "notes" && (
              notes.length === 0 ? (
                <EmptyState
                  title="No Editorial Notes"
                  body="Record margin notes, critiques, and thoughts alongside your reading material."
                  hint="Select text in reader and tap 'Add Note'"
                />
              ) : (
                <div className="space-y-3">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="border border-border p-3.5 bg-surface hard-shadow-hover transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold block truncate">
                            {getDocTitle(n.documentId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditNote(n)}
                            aria-label="Edit note"
                            className="p-1 text-muted hover:text-foreground border border-transparent hover:border-border transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItemToDelete({
                                type: "note",
                                id: n.id,
                                title: n.content,
                              })
                            }
                            aria-label="Delete note"
                            className="p-1 text-muted hover:text-accent border border-transparent hover:border-border transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="font-serif text-sm leading-relaxed text-foreground my-2 whitespace-pre-wrap">
                        {n.content}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[10px] font-mono text-muted">
                        <div className="flex items-center gap-3">
                          <span>{formatDate(n.createdAt)}</span>
                          {n.page ? (
                            <span>PAGE {n.page}</span>
                          ) : (
                            <span>{Math.round(n.position.percentage * 100)}%</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJumpToReader(n.documentId)}
                          className="flex items-center gap-1 text-foreground font-bold hover:text-accent uppercase transition-colors"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* EDIT BOOKMARK MODAL */}
      {editingBookmark && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border-2 border-foreground w-full max-w-sm p-4 hard-shadow-hover">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <h3 className="font-serif font-black text-base uppercase">Edit Bookmark</h3>
              <button
                type="button"
                onClick={() => setEditingBookmark(null)}
                className="text-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-muted uppercase text-[10px] mb-1">Title</label>
                <input
                  type="text"
                  value={editBmTitle}
                  onChange={(e) => setEditBmTitle(e.target.value)}
                  placeholder="Bookmark headline..."
                  className="w-full bg-background border border-border p-2 text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-muted uppercase text-[10px] mb-1">Note (optional)</label>
                <textarea
                  value={editBmNote}
                  onChange={(e) => setEditBmNote(e.target.value)}
                  rows={3}
                  placeholder="Additional observations..."
                  className="w-full bg-background border border-border p-2 text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingBookmark(null)}
                  className="px-3 py-1.5 border border-border text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBookmark}
                  className="px-3 py-1.5 bg-foreground text-background font-bold uppercase hover:bg-accent"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HIGHLIGHT MODAL */}
      {editingHighlight && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border-2 border-foreground w-full max-w-sm p-4 hard-shadow-hover">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <h3 className="font-serif font-black text-base uppercase">Edit Highlight</h3>
              <button
                type="button"
                onClick={() => setEditingHighlight(null)}
                className="text-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-muted uppercase text-[10px] mb-1">Color Palette</label>
                <div className="flex gap-2">
                  {["yellow", "green", "blue", "pink", "purple"].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setEditHlColor(col)}
                      className={`w-7 h-7 border-2 flex items-center justify-center transition-transform ${
                        editHlColor === col ? "border-foreground scale-110" : "border-border"
                      }`}
                    >
                      {renderColorPill(col)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-muted uppercase text-[10px] mb-1">Note (optional)</label>
                <textarea
                  value={editHlNote}
                  onChange={(e) => setEditHlNote(e.target.value)}
                  rows={3}
                  placeholder="Observations on this excerpt..."
                  className="w-full bg-background border border-border p-2 text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingHighlight(null)}
                  className="px-3 py-1.5 border border-border text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveHighlight}
                  className="px-3 py-1.5 bg-foreground text-background font-bold uppercase hover:bg-accent"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT NOTE MODAL */}
      {editingNote && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border-2 border-foreground w-full max-w-sm p-4 hard-shadow-hover">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <h3 className="font-serif font-black text-base uppercase">Edit Note</h3>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="text-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-muted uppercase text-[10px] mb-1">Content</label>
                <textarea
                  value={editNoteContent}
                  onChange={(e) => setEditNoteContent(e.target.value)}
                  rows={4}
                  placeholder="Editorial commentary..."
                  className="w-full bg-background border border-border p-2 text-foreground focus:outline-none focus:border-accent font-serif text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-3 py-1.5 border border-border text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-3 py-1.5 bg-foreground text-background font-bold uppercase hover:bg-accent"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border-2 border-foreground w-full max-w-xs p-4 hard-shadow-hover">
            <h3 className="font-serif font-black text-base text-foreground mb-1 uppercase">
              Delete {itemToDelete.type}?
            </h3>
            <p className="font-mono text-xs text-muted mb-3 line-clamp-2">
              Are you sure you want to remove "{itemToDelete.title}"? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 border border-border font-mono text-xs text-foreground uppercase hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-accent text-white font-mono text-xs font-bold uppercase hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2 border border-border font-mono text-xs uppercase flex items-center gap-2 shadow-md">
          <Check className="w-3.5 h-3.5 text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
