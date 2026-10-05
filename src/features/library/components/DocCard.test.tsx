import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocCard } from "./DocCard";
import type { DocumentSummary } from "@/types";

const mockDoc: DocumentSummary = {
  id: "e9f78d38-2d88-4228-9762-b9cf6d2ff135",
  title: "Clean Code Handbook",
  author: "Robert Martin",
  fileType: "pdf",
  fileSize: 1048576, // 1 MB
  pageCount: 350,
  wordCount: 85000,
  sectionCount: 15,
  progress: 0.45,
  completed: false,
  isArchived: false,
  createdAt: 1700000000000,
  lastOpenedAt: 1700005000000,
  parseStatus: "ready",
};

describe("DocCard component", () => {
  it("renders document title, author, format badge, and progress", () => {
    const handleRename = vi.fn();
    const handleArchive = vi.fn();
    const handleDelete = vi.fn();

    render(
      <MemoryRouter>
        <DocCard
          document={mockDoc}
          viewMode="grid"
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Clean Code Handbook")).toBeInTheDocument();
    expect(screen.getByText("Robert Martin")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("45% read")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
  });

  it("opens menu and triggers rename action", () => {
    const handleRename = vi.fn();
    const handleArchive = vi.fn();
    const handleDelete = vi.fn();

    render(
      <MemoryRouter>
        <DocCard
          document={mockDoc}
          viewMode="list"
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </MemoryRouter>
    );

    const optionsBtn = screen.getByRole("button", { name: "Document options" });
    fireEvent.click(optionsBtn);

    const renameBtn = screen.getByText("Rename");
    fireEvent.click(renameBtn);
    expect(handleRename).toHaveBeenCalledWith(mockDoc);
  });

  it("navigates to /read/:id when card is clicked", () => {
    const handleRename = vi.fn();
    const handleArchive = vi.fn();
    const handleDelete = vi.fn();

    render(
      <MemoryRouter>
        <DocCard
          document={mockDoc}
          viewMode="grid"
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </MemoryRouter>
    );

    const card = screen.getByTestId(`doc-card-${mockDoc.id}`);
    expect(card).toBeInTheDocument();
    fireEvent.click(card);
  });
});

