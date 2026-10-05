import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeScreen } from "./HomeScreen";
import * as trackerApi from "@/features/tracker/api";
import { HomeDashboard } from "@/types";

vi.mock("@/features/tracker/api");

const mockDashboardData: HomeDashboard = {
  continueReading: {
    document: {
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
    sectionTitle: "Memory Management",
    progress: 0.65,
    position: {
      documentId: "7b0a8806-a837-4c4f-a9db-fcb4369df319",
      percentage: 0.65,
      parserVersion: 1,
    },
  },
  recent: [
    {
      id: "8c1b9917-b948-5d5e-b0ec-7dc5470ef420",
      title: "Concurrent Patterns in Go",
      author: "Rob Pike",
      fileType: "epub",
      fileSize: 524288,
      sectionCount: 12,
      progress: 0.65,
      completed: false,
      isArchived: false,
      createdAt: 1700000000000,
      lastOpenedAt: 1700005000000,
      parseStatus: "ready",
    },
  ],
  currentlyReading: 1,
  completed: 2,
  activity: [
    { date: "2026-10-01", ms: 1200000 },
    { date: "2026-10-02", ms: 2400000 },
  ],
};

describe("HomeScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when there is no reading activity or documents", async () => {
    vi.spyOn(trackerApi, "getHomeDashboard").mockResolvedValue({
      continueReading: null,
      recent: [],
      currentlyReading: 0,
      completed: 0,
      activity: [],
    });

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Welcome to ReadTrack")).toBeInTheDocument();
      expect(screen.getByText("Open Library")).toBeInTheDocument();
    });
  });

  it("renders Continue Reading card, activity stats, and recent documents", async () => {
    vi.spyOn(trackerApi, "getHomeDashboard").mockResolvedValue(mockDashboardData);

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Continue Reading")).toBeInTheDocument();
      expect(screen.getByText("Rust for Systems")).toBeInTheDocument();
      expect(screen.getByText("Chapter: Memory Management")).toBeInTheDocument();
      expect(screen.getByText("Resume Reading")).toBeInTheDocument();
      expect(screen.getByText("Reading Activity")).toBeInTheDocument();
      expect(screen.getByText("Recent Documents")).toBeInTheDocument();
      expect(screen.getByText("Concurrent Patterns in Go")).toBeInTheDocument();
    });
  });

  it("renders error state when dashboard fails to load", async () => {
    vi.spyOn(trackerApi, "getHomeDashboard").mockRejectedValue(new Error("Network error"));

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to Load Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });
});
