import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TrackerScreen } from "./TrackerScreen";
import * as trackerApi from "@/features/tracker/api";
import { TrackerOverview } from "@/types";

vi.mock("@/features/tracker/api");

const mockOverview: TrackerOverview = {
  todayMs: 1800000, // 30 min
  weekMs: 7200000,  // 120 min
  documents: 5,
  completed: 2,
  currentlyReading: [
    {
      id: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
      title: "Rust for Systems",
      author: "Jane Doe",
      fileType: "pdf",
      fileSize: 1048576,
      sectionCount: 12,
      progress: 0.65,
      completed: false,
      isArchived: false,
      createdAt: 1700000000000,
      lastOpenedAt: 1700005000000,
      parseStatus: "ready",
    },
  ],
  activityByDay: [
    { date: "2026-10-01", ms: 900000 },
    { date: "2026-10-02", ms: 900000 },
  ],
};

describe("TrackerScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when there is no activity or documents", async () => {
    vi.spyOn(trackerApi, "getTrackerOverview").mockResolvedValue({
      todayMs: 0,
      weekMs: 0,
      documents: 0,
      completed: 0,
      currentlyReading: [],
      activityByDay: [],
    });
    vi.spyOn(trackerApi, "getReadingSessions").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TrackerScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Your reading map is waiting.")).toBeInTheDocument();
      expect(screen.getByText("Open Library")).toBeInTheDocument();
    });
  });

  it("renders key metrics and currently reading documents with activity", async () => {
    vi.spyOn(trackerApi, "getTrackerOverview").mockResolvedValue(mockOverview);
    vi.spyOn(trackerApi, "getReadingSessions").mockResolvedValue([
      {
        id: "sess-1",
        documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
        startedAt: 1700000000000,
        endedAt: 1700001800000,
        lastHeartbeatAt: 1700001800000,
        durationSeconds: 1800,
        activeSeconds: 1800,
        startPos: 0,
        endPos: 10,
        pagesRead: 0,
        segmentsRead: 5,
      },
    ]);

    render(
      <MemoryRouter>
        <TrackerScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("30")).toBeInTheDocument(); // Today minutes
      expect(screen.getByText("120")).toBeInTheDocument(); // Week minutes
      expect(screen.getByText("Currently Reading")).toBeInTheDocument();
      expect(screen.getByText("Rust for Systems")).toBeInTheDocument();
      expect(screen.getByText("Recent Sessions")).toBeInTheDocument();
    });
  });

  it("renders error state when tracker overview fails to load", async () => {
    vi.spyOn(trackerApi, "getTrackerOverview").mockRejectedValue(new Error("Database error"));
    vi.spyOn(trackerApi, "getReadingSessions").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TrackerScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to Load Tracker")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });
});
