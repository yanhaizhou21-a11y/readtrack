import { describe, it, expect } from "vitest";
import {
  DocumentSummarySchema,
  DocumentDetailSchema,
  LogicalPositionSchema,
  SectionPayloadSchema,
  DocumentListResponseSchema,
} from "@/types/document";

describe("IPC Contract Resilience Tests (Rust Serde <-> Zod Contract)", () => {
  it("parses DocumentSummary when all optional fields are populated", () => {
    const rawPopulated = {
      id: "7662cf55-27a3-4b68-9844-3d0d34208d17",
      title: "Clean Architecture",
      author: "Robert C. Martin",
      fileType: "pdf",
      fileSize: 1048576,
      pageCount: 350,
      wordCount: 85000,
      sectionCount: 20,
      progress: 0.25,
      completed: false,
      isArchived: false,
      createdAt: 1700000000000,
      lastOpenedAt: 1700005000000,
      thumbnailUrl: "rt://thumb/7662cf55-27a3-4b68-9844-3d0d34208d17",
      parseStatus: "ready",
    };

    const parsed = DocumentSummarySchema.safeParse(rawPopulated);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBe("Robert C. Martin");
      expect(parsed.data.pageCount).toBe(350);
      expect(parsed.data.lastOpenedAt).toBe(1700005000000);
      expect(parsed.data.thumbnailUrl).toBe("rt://thumb/7662cf55-27a3-4b68-9844-3d0d34208d17");
    }
  });

  it("parses DocumentSummary when Rust sends None as null (raw Rust/SQLite nulls)", () => {
    // This is the EXACT payload that caused the bug on new imports
    const rawWithNulls = {
      id: "7662cf55-27a3-4b68-9844-3d0d34208d17",
      title: "SaaS_POS_PRD.md",
      author: null,
      fileType: "md",
      fileSize: 40448,
      pageCount: null,
      wordCount: 1200,
      sectionCount: 5,
      progress: 0.0,
      completed: false,
      isArchived: false,
      createdAt: 1729930000000,
      lastOpenedAt: null,
      thumbnailUrl: null,
      parseStatus: "ready",
    };

    const parsed = DocumentSummarySchema.safeParse(rawWithNulls);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // opt() guarantees the UI receives undefined, never null
      expect(parsed.data.author).toBeUndefined();
      expect(parsed.data.pageCount).toBeUndefined();
      expect(parsed.data.lastOpenedAt).toBeUndefined();
      expect(parsed.data.thumbnailUrl).toBeUndefined();
      expect(parsed.data.wordCount).toBe(1200);
    }
  });

  it("parses DocumentSummary when Rust omits None fields via skip_serializing_if", () => {
    const rawOmitted = {
      id: "7662cf55-27a3-4b68-9844-3d0d34208d17",
      title: "Notes.txt",
      fileType: "txt",
      fileSize: 1024,
      sectionCount: 1,
      progress: 0.0,
      completed: false,
      isArchived: false,
      createdAt: 1729930000000,
      parseStatus: "ready",
    };

    const parsed = DocumentSummarySchema.safeParse(rawOmitted);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBeUndefined();
      expect(parsed.data.pageCount).toBeUndefined();
      expect(parsed.data.lastOpenedAt).toBeUndefined();
    }
  });

  it("rejects DocumentSummary when mandatory fields are invalid or missing (validation is preserved)", () => {
    const invalidPayload = {
      id: "7662cf55-27a3-4b68-9844-3d0d34208d17",
      title: "", // empty title
      fileType: "unsupported_format",
      progress: 2.5, // invalid progress (> 1)
    };

    const parsed = DocumentSummarySchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("parses DocumentDetail with null and omitted optional fields", () => {
    const rawDetailWithNulls = {
      id: "7662cf55-27a3-4b68-9844-3d0d34208d17",
      title: "Hamlet.epub",
      author: null,
      fileType: "epub",
      fileSize: 204800,
      pageCount: null,
      wordCount: null,
      sectionCount: 12,
      progress: 0.0,
      completed: false,
      isArchived: false,
      createdAt: 1729930000000,
      lastOpenedAt: null,
      thumbnailUrl: null,
      parseStatus: "ready",
      originalFilename: "Hamlet.epub",
      mimeType: "application/epub+zip",
      contentHash: "a".repeat(64),
      totalReadMs: 0,
      sessionCount: 0,
      lastReadAt: null,
      position: null,
    };

    const parsed = DocumentDetailSchema.safeParse(rawDetailWithNulls);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lastReadAt).toBeUndefined();
      expect(parsed.data.position).toBeUndefined();
    }
  });

  it("parses SectionPayload and LogicalPosition with optional null values", () => {
    const rawSection = {
      id: "sec-1",
      index: 0,
      title: null,
      level: 1,
      wordCount: 50,
      blocks: [
        {
          id: "blk-1",
          type: "paragraph",
          text: "Intro text",
          wordCount: 2,
          level: null,
        },
      ],
    };

    const parsedSection = SectionPayloadSchema.safeParse(rawSection);
    expect(parsedSection.success).toBe(true);
    if (parsedSection.success) {
      expect(parsedSection.data.title).toBeUndefined();
      expect(parsedSection.data.blocks[0]?.level).toBeUndefined();
    }

    const rawPos = {
      documentId: "doc-1",
      sectionId: null,
      blockId: null,
      offset: null,
      page: null,
      pageOffset: null,
      percentage: 0.1,
      parserVersion: 1,
    };

    const parsedPos = LogicalPositionSchema.safeParse(rawPos);
    expect(parsedPos.success).toBe(true);
    if (parsedPos.success) {
      expect(parsedPos.data.sectionId).toBeUndefined();
      expect(parsedPos.data.blockId).toBeUndefined();
    }
  });

  it("fault-tolerant DocumentListResponse: malformed items are logged and skipped without breaking the library", () => {
    const rawListWithOneCorrupted = {
      items: [
        {
          id: "valid-doc-1",
          title: "Valid Document 1",
          author: null,
          fileType: "txt",
          fileSize: 100,
          sectionCount: 1,
          progress: 0,
          completed: false,
          isArchived: false,
          createdAt: 1729930000000,
          parseStatus: "ready",
        },
        {
          id: "corrupted-doc-2",
          // missing title and invalid fileType
          fileType: "INVALID_UNKNOWN",
        },
        {
          id: "valid-doc-3",
          title: "Valid Document 3",
          fileType: "md",
          fileSize: 200,
          sectionCount: 2,
          progress: 0.5,
          completed: false,
          isArchived: false,
          createdAt: 1729930000000,
          parseStatus: "ready",
        },
      ],
      total: 3,
    };

    const parsed = DocumentListResponseSchema.safeParse(rawListWithOneCorrupted);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // It should recover the 2 valid items and skip the 1 broken item!
      expect(parsed.data.items.length).toBe(2);
      expect(parsed.data.items[0]?.id).toBe("valid-doc-1");
      expect(parsed.data.items[1]?.id).toBe("valid-doc-3");
      expect(parsed.data.total).toBe(3);
    }
  });
});
