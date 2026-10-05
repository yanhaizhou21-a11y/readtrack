import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DuplicateDialog } from "./DuplicateDialog";

describe("DuplicateDialog component", () => {
  it("renders collision warning and triggers choices correctly", () => {
    const handleOpenExisting = vi.fn();
    const handleReplace = vi.fn();
    const handleClose = vi.fn();

    render(
      <DuplicateDialog
        isOpen={true}
        existingId="doc-existing-uuid-123"
        sourcePath="C:/docs/duplicate.pdf"
        onOpenExisting={handleOpenExisting}
        onReplace={handleReplace}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Duplicate Document")).toBeInTheDocument();
    expect(
      screen.getByText("An identical document already exists in your library. What would you like to do?")
    ).toBeInTheDocument();

    // Click Open Existing
    const openBtn = screen.getByRole("button", { name: /Open Existing Document/i });
    fireEvent.click(openBtn);
    expect(handleOpenExisting).toHaveBeenCalledWith("doc-existing-uuid-123");

    // Click Replace
    const replaceBtn = screen.getByRole("button", { name: /Replace with New Copy/i });
    fireEvent.click(replaceBtn);
    expect(handleReplace).toHaveBeenCalledWith("C:/docs/duplicate.pdf");

    // Click Cancel
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <DuplicateDialog
        isOpen={false}
        existingId="123"
        sourcePath="path.txt"
        onOpenExisting={vi.fn()}
        onReplace={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
