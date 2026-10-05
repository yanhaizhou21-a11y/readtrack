import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentModal } from "./SegmentModal";
import { MapSegment } from "@/types";

const mockSegment: MapSegment = {
  index: 4,
  status: "reading",
  wordCount: 300,
};

describe("SegmentModal component", () => {
  it("renders segment details, word count, and estimated time", () => {
    const handleClose = vi.fn();
    render(<SegmentModal segment={mockSegment} onClose={handleClose} />);

    expect(screen.getByText("Segment #5")).toBeInTheDocument();
    expect(screen.getByText("reading")).toBeInTheDocument();
    expect(screen.getByText("300 words")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(<SegmentModal segment={mockSegment} onClose={handleClose} />);

    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onContinueReading when read button is clicked", () => {
    const handleClose = vi.fn();
    const handleContinue = vi.fn();
    render(
      <SegmentModal
        segment={mockSegment}
        onClose={handleClose}
        onContinueReading={handleContinue}
      />
    );

    const continueBtn = screen.getByText("Continue Reading From Here");
    fireEvent.click(continueBtn);

    expect(handleContinue).toHaveBeenCalledWith(mockSegment);
  });

  it("renders nothing when segment is null", () => {
    const { container } = render(<SegmentModal segment={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
