import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadingSpine } from "./ReadingSpine";
import { MapSegment } from "@/types";

const mockSegments: MapSegment[] = [
  { index: 0, status: "read", wordCount: 150 },
  { index: 1, status: "reading", wordCount: 120 },
  { index: 2, status: "skipped", wordCount: 80 },
  { index: 3, status: "unread", wordCount: 200 },
];

describe("ReadingSpine component", () => {
  it("renders status legend and segment cells", () => {
    render(<ReadingSpine segments={mockSegments} />);

    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
  });

  it("calls onSelectSegment when a cell is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <ReadingSpine
        segments={mockSegments}
        onSelectSegment={handleSelect}
      />
    );

    const cell = screen.getByLabelText("Segment 1: read, 150 words");
    fireEvent.click(cell);

    expect(handleSelect).toHaveBeenCalledWith(mockSegments[0]);
  });

  it("renders empty state message when segments array is empty", () => {
    render(<ReadingSpine segments={[]} />);
    expect(screen.getByText("No segments available")).toBeInTheDocument();
  });
});
