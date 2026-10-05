import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AnnotationsScreen } from "./AnnotationsScreen";
import * as annotationsApi from "./api";
import * as documentsApi from "@/features/library/api/documents";
import { Bookmark, Highlight, Note } from "@/types";

vi.mock("./api");
vi.mock("@/features/library/api/documents");

const mockBookmarks: Bookmark[] = [
  {
    id: "bm-1",
    documentId: "doc-1",
    position: {
      documentId: "doc-1",
      percentage: 0.42,
      parserVersion: 1,
    },
    pos: 100,
    page: 5,
    title: "Key Axiom on Memory",
    excerpt: "Memory layout defines system latency",
    note: "Review for benchmark",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

const mockHighlights: Highlight[] = [
  {
    id: "hl-1",
    documentId: "doc-1",
    positionStart: { documentId: "doc-1", percentage: 0.15, parserVersion: 1 },
    positionEnd: { documentId: "doc-1", percentage: 0.16, parserVersion: 1 },
    startPos: 50,
    endPos: 120,
    page: 2,
    selectedText: "Zero-cost abstractions make systems reliable and fast.",
    color: "yellow",
    note: "Core philosophy",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

const mockNotes: Note[] = [
  {
    id: "note-1",
    documentId: "doc-1",
    highlightId: null,
    position: { documentId: "doc-1", percentage: 0.5, parserVersion: 1 },
    pos: 200,
    page: 8,
    content: "Need to verify concurrency invariants here.",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

describe("AnnotationsScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue({
      items: [
        {
          id: "doc-1",
          title: "System Architecture & Theory",
          fileType: "pdf",
          fileSize: 1024,
          sectionCount: 10,
          progress: 0.42,
          completed: false,
          isArchived: false,
          createdAt: 1700000000000,
          parseStatus: "ready",
        },
      ],
      total: 1,
    });
    vi.spyOn(annotationsApi, "listBookmarks").mockResolvedValue(mockBookmarks);
    vi.spyOn(annotationsApi, "listHighlights").mockResolvedValue(mockHighlights);
    vi.spyOn(annotationsApi, "listNotes").mockResolvedValue(mockNotes);
  });

  it("renders bookmarks list by default", async () => {
    render(
      <MemoryRouter>
        <AnnotationsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Key Axiom on Memory")).toBeInTheDocument();
      expect(screen.getAllByText("System Architecture & Theory").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/PAGE 5/i)).toBeInTheDocument();
    });
  });

  it("switches to highlights tab and displays highlights", async () => {
    render(
      <MemoryRouter>
        <AnnotationsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Key Axiom on Memory")).toBeInTheDocument();
    });

    // Click Highlights tab
    const highlightsTab = screen.getByRole("button", { name: /Highlights/i });
    fireEvent.click(highlightsTab);

    await waitFor(() => {
      expect(
        screen.getByText(/"Zero-cost abstractions make systems reliable and fast."/)
      ).toBeInTheDocument();
    });
  });

  it("switches to notes tab and displays notes", async () => {
    render(
      <MemoryRouter>
        <AnnotationsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Key Axiom on Memory")).toBeInTheDocument();
    });

    // Click Notes tab
    const notesTab = screen.getByRole("button", { name: /Notes/i });
    fireEvent.click(notesTab);

    await waitFor(() => {
      expect(
        screen.getByText("Need to verify concurrency invariants here.")
      ).toBeInTheDocument();
    });
  });

  it("renders empty state when there are no annotations", async () => {
    vi.spyOn(annotationsApi, "listBookmarks").mockResolvedValue([]);
    vi.spyOn(annotationsApi, "listHighlights").mockResolvedValue([]);
    vi.spyOn(annotationsApi, "listNotes").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AnnotationsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No Bookmarks Filed")).toBeInTheDocument();
    });
  });
});
