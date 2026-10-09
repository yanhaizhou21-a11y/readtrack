import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookReminderDialog } from "./BookReminderDialog";
import type { DocumentDetail, Reminder } from "@/types";

const mockDoc: DocumentDetail = {
  id: "doc-1",
  title: "Crime and Punishment",
  author: "Fyodor Dostoevsky",
  originalFilename: "crime.epub",
  mimeType: "application/epub+zip",
  contentHash: "hash123",
  totalReadMs: 3600000,
  sessionCount: 5,
  fileType: "epub",
  fileSize: 1024,
  sectionCount: 10,
  progress: 0.3,
  completed: false,
  isArchived: false,
  createdAt: 1700000000000,
  parseStatus: "ready",
};

const mockReminder: Reminder = {
  id: "rem-1",
  documentId: "doc-1",
  enabled: true,
  scheduleType: "daily",
  timeOfDayMin: 1200,
  daysOfWeek: null,
  scheduledAt: null,
  repeatInterval: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe("BookReminderDialog component", () => {
  it("renders document title and reminder inputs when open", () => {
    render(
      <BookReminderDialog
        isOpen={true}
        document={mockDoc}
        reminder={mockReminder}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Book Reminder")).toBeInTheDocument();
    expect(screen.getByText("Crime and Punishment")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle reminder active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Reminder" })).toBeInTheDocument();
  });

  it("calls onSave with updated schedule upon submission", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <BookReminderDialog
        isOpen={true}
        document={mockDoc}
        reminder={null}
        onSave={handleSave}
        onClose={handleClose}
      />
    );

    // Click Weekdays frequency
    fireEvent.click(screen.getByRole("button", { name: "weekdays" }));

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save Reminder" }));

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        scheduleType: "weekdays",
        enabled: true,
      })
    );
  });

  it("calls onDelete when Remove button is clicked", () => {
    const handleDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <BookReminderDialog
        isOpen={true}
        document={mockDoc}
        reminder={mockReminder}
        onSave={vi.fn()}
        onDelete={handleDelete}
        onClose={vi.fn()}
      />
    );

    const removeBtn = screen.getByRole("button", { name: "Remove" });
    fireEvent.click(removeBtn);

    expect(handleDelete).toHaveBeenCalledWith("rem-1");
  });
});
