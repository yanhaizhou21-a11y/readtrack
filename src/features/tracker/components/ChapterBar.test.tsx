import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChapterBar } from "./ChapterBar";
import { MapSection } from "@/types";

const mockSection: MapSection = {
  sectionId: "sec-1",
  index: 0,
  title: "Chapter 1: The Beginning",
  progress: 0.65,
  status: "reading",
  lastReadAt: Date.now(),
  readMs: 120000,
  sessions: 2,
  segments: [
    { index: 0, status: "read", wordCount: 150 },
    { index: 1, status: "reading", wordCount: 120 },
    { index: 2, status: "unread", wordCount: 100 },
  ],
  startPos: {
    documentId: "doc-1",
    sectionId: 0,
    percentage: 0,
    parserVersion: 1,
  },
};

describe("ChapterBar component", () => {
  it("renders chapter title, progress percentage, and segment micro-bars", () => {
    render(<ChapterBar section={mockSection} />);

    expect(screen.getByText("Chapter 1: The Beginning")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("handles click callback when tapped", () => {
    const handleClick = vi.fn();
    render(<ChapterBar section={mockSection} onClick={handleClick} />);

    fireEvent.click(screen.getByText("Chapter 1: The Beginning"));
    expect(handleClick).toHaveBeenCalledWith(mockSection);
  });

  it("renders completed status correctly when progress >= 98%", () => {
    const completedSection: MapSection = {
      ...mockSection,
      progress: 1.0,
      status: "read",
    };
    render(<ChapterBar section={completedSection} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
