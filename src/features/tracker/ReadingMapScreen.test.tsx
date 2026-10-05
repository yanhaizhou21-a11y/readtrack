import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReadingMapScreen } from "./ReadingMapScreen";
import * as trackerApi from "@/features/tracker/api";
import * as docApi from "@/features/library/api/documents";
import { ReadingMap, DocumentDetail } from "@/types";

vi.mock("@/features/tracker/api");
vi.mock("@/features/library/api/documents");

const mockDoc: DocumentDetail = {
  id: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
  title: "Systems Programming",
  author: "Alice",
  fileType: "md",
  fileSize: 4096,
  sectionCount: 2,
  progress: 0.5,
  completed: false,
  isArchived: false,
  createdAt: 1700000000000,
  lastOpenedAt: 1700005000000,
  parseStatus: "ready",
  originalFilename: "systems.md",
  mimeType: "text/markdown",
  contentHash: "a".repeat(64),
  totalReadMs: 300000,
  sessionCount: 3,
};

const mockMap: ReadingMap = {
  documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
  progress: 0.5,
  completed: false,
  totalReadMs: 300000,
  sessions: 3,
  lastReadAt: 1700005000000,
  sections: [
    {
      sectionId: "sec-1",
      index: 0,
      title: "Introduction",
      progress: 1.0,
      status: "read",
      lastReadAt: 1700005000000,
      readMs: 150000,
      sessions: 1,
      segments: [
        { index: 0, status: "read", wordCount: 150 },
      ],
      startPos: {
        documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
        percentage: 0,
        parserVersion: 1,
      },
    },
    {
      sectionId: "sec-2",
      index: 1,
      title: "Concurrency",
      progress: 0.0,
      status: "unread",
      lastReadAt: null,
      readMs: 0,
      sessions: 0,
      segments: [
        { index: 1, status: "unread", wordCount: 200 },
      ],
      startPos: {
        documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
        percentage: 0.5,
        parserVersion: 1,
      },
    },
  ],
  current: {
    documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
    percentage: 0.5,
    parserVersion: 1,
  },
};

describe("ReadingMapScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders document title, progress percent, chapters, and spine", async () => {
    vi.spyOn(trackerApi, "getReadingMap").mockResolvedValue(mockMap);
    vi.spyOn(docApi, "getDocument").mockResolvedValue(mockDoc);

    render(
      <MemoryRouter initialEntries={["/tracker/7b0a8806-a837-4c4f-a9db-fcb4369df319"]}>
        <Routes>
          <Route path="/tracker/:id" element={<ReadingMapScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Systems Programming")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByText("Introduction")).toBeInTheDocument();
      expect(screen.getByText("Concurrency")).toBeInTheDocument();
      expect(screen.getByText("Continue Reading")).toBeInTheDocument();
    });
  });

  it("renders error state when reading map fails to load", async () => {
    vi.spyOn(trackerApi, "getReadingMap").mockRejectedValue(new Error("Failed"));
    vi.spyOn(docApi, "getDocument").mockRejectedValue(new Error("Failed"));

    render(
      <MemoryRouter initialEntries={["/tracker/7b0a8806-a837-4c4f-a9db-fcb4369df319"]}>
        <Routes>
          <Route path="/tracker/:id" element={<ReadingMapScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to Load Reading Map")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });
});
