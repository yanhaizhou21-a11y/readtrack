import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchScreen } from "./SearchScreen";
import * as searchApi from "./api";
import * as documentsApi from "@/features/library/api/documents";
import { SearchHit } from "@/types";

vi.mock("./api");
vi.mock("@/features/library/api/documents");

const mockHits: SearchHit[] = [
  {
    kind: "content",
    documentId: "doc-1",
    documentTitle: "Introduction to Rust",
    sectionTitle: "Ownership and Lifetimes",
    page: 12,
    snippet: [
      { text: "In this section we examine ", match: false },
      { text: "borrow checker", match: true },
      { text: " mechanics in detail.", match: false },
    ],
    position: {
      documentId: "doc-1",
      sectionId: 1,
      percentage: 0.35,
      parserVersion: 1,
    },
    refId: "sec-1",
  },
];

describe("SearchScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue({
      items: [
        {
          id: "doc-1",
          title: "Introduction to Rust",
          fileType: "pdf",
          fileSize: 2048,
          sectionCount: 8,
          progress: 0.35,
          completed: false,
          isArchived: false,
          createdAt: 1700000000000,
          parseStatus: "ready",
        },
      ],
      total: 1,
    });
    vi.spyOn(searchApi, "searchDocuments").mockResolvedValue(mockHits);
  });

  it("renders empty state initially before any query is typed", async () => {
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>
    );

    expect(screen.getByText("Search Publication Archives")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Type query to scan text, notes, & marks.../i)
    ).toBeInTheDocument();
  });

  it("triggers search and displays matching hits with highlighted snippets", async () => {
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Type query to scan text, notes, & marks.../i);
    fireEvent.change(input, { target: { value: "borrow checker" } });

    await waitFor(
      () => {
        expect(screen.getByRole("heading", { name: "Introduction to Rust" })).toBeInTheDocument();
        expect(screen.getByText("PASSAGE")).toBeInTheDocument();
        expect(screen.getByText("borrow checker", { selector: "mark" })).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("renders empty state when query returns no results", async () => {
    vi.spyOn(searchApi, "searchDocuments").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Type query to scan text, notes, & marks.../i);
    fireEvent.change(input, { target: { value: "nonexistent term" } });

    await waitFor(
      () => {
        expect(
          screen.getByText('No dispatches found for "nonexistent term"')
        ).toBeInTheDocument();
      },
      { timeout: 1500 }
    );
  });
});
