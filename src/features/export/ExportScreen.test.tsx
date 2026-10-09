import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExportScreen } from "./ExportScreen";
import * as exportApi from "./api";
import * as documentsApi from "@/features/library/api/documents";
import type { DocumentSummary } from "@/types";

vi.mock("./api");
vi.mock("@/features/library/api/documents");
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockDocs: DocumentSummary[] = [
  {
    id: "doc-1",
    title: "The Architecture of Open Source",
    author: "Amy Brown",
    fileType: "pdf",
    fileSize: 1048576,
    sectionCount: 12,
    progress: 0.65,
    completed: false,
    isArchived: false,
    createdAt: 1700000000000,
    parseStatus: "ready",
  },
  {
    id: "doc-2",
    title: "Rust for Systems",
    author: "Steve Klabnik",
    fileType: "md",
    fileSize: 20480,
    sectionCount: 5,
    progress: 1.0,
    completed: true,
    isArchived: false,
    createdAt: 1700000050000,
    parseStatus: "ready",
  },
];

describe("ExportScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty library state when no publications exist", async () => {
    vi.mocked(documentsApi.listDocuments).mockResolvedValue({
      items: [],
      total: 0,
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No Publications Archived")).toBeInTheDocument();
    });
    expect(screen.getByText("Go to Library")).toBeInTheDocument();
  });

  it("renders export format cards and scope selector when documents exist", async () => {
    vi.mocked(documentsApi.listDocuments).mockResolvedValue({
      items: mockDocs,
      total: 2,
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("OFFLINE READING LEDGER")).toBeInTheDocument();
    });

    expect(screen.getByText(/Entire Library \(2 Publications\)/)).toBeInTheDocument();
    expect(screen.getByText("Excel Ledger (.xlsx)")).toBeInTheDocument();
    expect(screen.getByText("Print Report (.pdf)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export .xlsx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export .pdf" })).toBeInTheDocument();
  });

  it("executes XLSX export and renders success card with share button", async () => {
    vi.mocked(documentsApi.listDocuments).mockResolvedValue({
      items: mockDocs,
      total: 2,
    });

    vi.mocked(exportApi.exportXlsx).mockResolvedValue({
      path: "C:/di/readtrack/library/exports/ReadTrack-Report-2026-10-06.xlsx",
      fileName: "ReadTrack-Report-2026-10-06.xlsx",
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export .xlsx" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export .xlsx" }));

    await waitFor(() => {
      expect(exportApi.exportXlsx).toHaveBeenCalledWith({ documentIds: undefined });
      expect(screen.getByText("DOSSIER GENERATION COMPLETE")).toBeInTheDocument();
    });

    expect(screen.getByText("ReadTrack-Report-2026-10-06.xlsx")).toBeInTheDocument();
    expect(
      screen.getByText("C:/di/readtrack/library/exports/ReadTrack-Report-2026-10-06.xlsx")
    ).toBeInTheDocument();

    // Test sharing
    vi.mocked(exportApi.exportShare).mockResolvedValue();
    fireEvent.click(screen.getByRole("button", { name: /Open \/ Share File/i }));

    await waitFor(() => {
      expect(exportApi.exportShare).toHaveBeenCalledWith({
        path: "C:/di/readtrack/library/exports/ReadTrack-Report-2026-10-06.xlsx",
      });
    });
  });

  it("executes PDF export with custom document selection", async () => {
    vi.mocked(documentsApi.listDocuments).mockResolvedValue({
      items: mockDocs,
      total: 2,
    });

    vi.mocked(exportApi.exportPdf).mockResolvedValue({
      path: "C:/di/readtrack/library/exports/ReadTrack-Reading-Report-2026-10-06.pdf",
      fileName: "ReadTrack-Reading-Report-2026-10-06.pdf",
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Select Publications")).toBeInTheDocument();
    });

    // Select custom publications
    fireEvent.click(screen.getByText("Select Publications"));

    // Deselect one doc
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // uncheck doc-1

    fireEvent.click(screen.getByRole("button", { name: "Export .pdf" }));

    await waitFor(() => {
      expect(exportApi.exportPdf).toHaveBeenCalledWith({
        documentIds: ["doc-2"],
      });
      expect(screen.getByText("DOSSIER GENERATION COMPLETE")).toBeInTheDocument();
    });
  });
});
