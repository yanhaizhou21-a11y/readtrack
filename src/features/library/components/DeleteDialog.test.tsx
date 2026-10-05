import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteDialog } from "./DeleteDialog";
import type { DocumentSummary } from "@/types";

const mockDoc: DocumentSummary = {
  id: "e9f78d38-2d88-4228-9762-b9cf6d2ff135",
  title: "Target Book To Delete",
  fileType: "epub",
  fileSize: 204800,
  sectionCount: 10,
  progress: 0.1,
  completed: false,
  isArchived: false,
  createdAt: 1700000000000,
  parseStatus: "ready",
};

describe("DeleteDialog component", () => {
  it("renders document title and calls onConfirm when Delete button is clicked", () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <DeleteDialog
        isOpen={true}
        document={mockDoc}
        isDeleting={false}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Delete Document")).toBeInTheDocument();
    expect(screen.getByText(/Target Book To Delete/)).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);
    expect(handleConfirm).toHaveBeenCalledWith(mockDoc);
  });

  it("calls onClose when Cancel button is clicked", () => {
    const handleClose = vi.fn();

    render(
      <DeleteDialog
        isOpen={true}
        document={mockDoc}
        isDeleting={false}
        onConfirm={vi.fn()}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
