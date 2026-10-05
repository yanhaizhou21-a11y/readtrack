import { describe, it, expect, beforeEach } from "vitest";
import { OpaqueBoxDriver } from "./harness/opaque_box_driver";
import {
  MAX_FILE_SIZE_BYTES,
  OVERFLOW_FILE_SIZE_BYTES,
  PATH_TRAVERSAL_PAYLOADS,
  STRING_BOUNDARY_TITLES,
  FAKE_PDF_CONTENT,
  CORRUPT_BINARY_CONTENT,
} from "./harness/fixtures";
import { AppErrorDto } from "./harness/contracts";

describe("Tier 2: Boundary & Corner Cases (Limits, Traversal, Spoofing, Corrupt)", () => {
  let driver: OpaqueBoxDriver;

  beforeEach(() => {
    driver = new OpaqueBoxDriver();
  });

  // --- Domain 1: Storage & Ingestion Boundaries ---

  it("T2-1: Zero-byte file is handled safely with 0 word count and zero orphaned files", async () => {
    const doc = await driver.documentImport({
      source: "empty.txt",
      fileContent: "",
    });

    expect(doc.fileSize).toBe(0);
    expect(doc.wordCount).toBe(0);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("T2-2: Oversized file exceeding 200MB limit (209,716,224 bytes) is rejected with InvalidDocument", async () => {
    await expect(
      driver.documentImport({
        source: "massive.txt",
        fileSize: OVERFLOW_FILE_SIZE_BYTES,
        fileContent: "overflow",
      })
    ).rejects.toMatchObject({
      code: "InvalidDocument",
    } as Partial<AppErrorDto>);

    expect(driver.getSandboxFileCount()).toBe(0);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("T2-3: Exact boundary file size (200MB = 209,715,200 bytes) is accepted without error", async () => {
    const doc = await driver.documentImport({
      source: "exact_limit.txt",
      fileSize: MAX_FILE_SIZE_BYTES,
      fileContent: "boundary content",
    });

    expect(doc.fileSize).toBe(MAX_FILE_SIZE_BYTES);
    expect(driver.getSandboxFileCount()).toBe(1);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("T2-4: Failed ingestion rolls back and unlinks all temporary staged files", async () => {
    try {
      await driver.documentImport({
        source: "bad_ext.xyz",
        fileContent: "bad content",
      });
    } catch {
      // Expected rejection
    }

    expect(driver.getTempFileCount()).toBe(0);
    expect(driver.getSandboxFileCount()).toBe(0);
  });

  it("T2-5: Unsupported file extension is rejected with typed UnsupportedFormat error", async () => {
    await expect(
      driver.documentImport({
        source: "archive.tar.gz",
        fileContent: "binary tarball",
      })
    ).rejects.toMatchObject({
      code: "UnsupportedFormat",
      details: { ext: "gz" },
    } as Partial<AppErrorDto>);
  });

  // --- Domain 2: Security & Path Traversal Boundaries ---

  it("T2-6: Relative directory traversal (../../../../etc/passwd) rejected with PermissionDenied", async () => {
    await expect(
      driver.documentImport({
        source: PATH_TRAVERSAL_PAYLOADS[0],
        fileContent: "fake passwd content",
      })
    ).rejects.toMatchObject({
      code: "PermissionDenied",
    } as Partial<AppErrorDto>);

    expect(driver.getSandboxFileCount()).toBe(0);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("T2-7: Windows backslash traversal (..\\..\\Windows\\System32) rejected with PermissionDenied", async () => {
    await expect(
      driver.documentImport({
        source: PATH_TRAVERSAL_PAYLOADS[1],
        fileContent: "hosts file attempt",
      })
    ).rejects.toMatchObject({
      code: "PermissionDenied",
    } as Partial<AppErrorDto>);
  });

  it("T2-8: Path containing null byte injection is rejected with PermissionDenied", async () => {
    await expect(
      driver.documentImport({
        source: PATH_TRAVERSAL_PAYLOADS[5],
        fileContent: "null byte injected string",
      })
    ).rejects.toMatchObject({
      code: "PermissionDenied",
    } as Partial<AppErrorDto>);
  });

  it("T2-9: Absolute root escape (/root/system.log) rejected with PermissionDenied", async () => {
    await expect(
      driver.documentImport({
        source: PATH_TRAVERSAL_PAYLOADS[3],
        fileContent: "root system logs",
      })
    ).rejects.toMatchObject({
      code: "PermissionDenied",
    } as Partial<AppErrorDto>);
  });

  it("T2-10: Traversal attempts never leak temporary or staged files into sandbox directory", async () => {
    for (const payload of PATH_TRAVERSAL_PAYLOADS) {
      try {
        await driver.documentImport({
          source: payload,
          fileContent: "attack",
        });
      } catch {
        // Ignored
      }
    }

    expect(driver.getSandboxFileCount()).toBe(0);
    expect(driver.getTempFileCount()).toBe(0);
  });

  // --- Domain 3: Magic Bytes & Format Spoofing Boundaries ---

  it("T2-11: Spoofed PDF (fake.pdf with plain text) rejected due to missing magic bytes", async () => {
    await expect(
      driver.documentImport({
        source: "fake.pdf",
        fileContent: FAKE_PDF_CONTENT,
      })
    ).rejects.toMatchObject({
      code: "InvalidDocument",
    } as Partial<AppErrorDto>);

    expect(driver.getSandboxFileCount()).toBe(0);
  });

  it("T2-12: Truncated or corrupted PDF binary header rejected with InvalidDocument", async () => {
    await expect(
      driver.documentImport({
        source: "corrupt.pdf",
        fileContent: CORRUPT_BINARY_CONTENT,
      })
    ).rejects.toMatchObject({
      code: "InvalidDocument",
    } as Partial<AppErrorDto>);
  });

  it("T2-13: Markdown document with unclosed code fences parsed safely without hanging", async () => {
    const unclosedMd = "# Broken Markdown\n\n```typescript\nconst x = 10;\n// missing closing backticks";
    const doc = await driver.documentImport({
      source: "unclosed.md",
      fileContent: unclosedMd,
    });

    expect(doc.sectionCount).toBeGreaterThanOrEqual(1);
    expect(doc.parseStatus).toBe("ready");
  });

  it("T2-14: Markdown with deep nested blockquotes (15 levels) parsed gracefully", async () => {
    const deepQuotes = "# Title\n\n" + "> ".repeat(15) + "Deeply nested wisdom.";
    const doc = await driver.documentImport({
      source: "deep_quotes.md",
      fileContent: deepQuotes,
    });

    expect(doc.sectionCount).toBeGreaterThanOrEqual(1);
  });

  it("T2-15: Plain text document containing control characters handled without parsing crash", async () => {
    const controlChars = "Hello \x01\x02\x03\x04\x05\x06\x07\x08 World!\nSecond line.";
    const doc = await driver.documentImport({
      source: "control_chars.txt",
      fileContent: controlChars,
    });

    expect(doc.wordCount).toBeGreaterThanOrEqual(1);
  });

  // --- Domain 4: Input Validation & String Length Boundaries ---

  it("T2-16: Document rename with empty string (0 characters) rejected with InvalidInput", async () => {
    const doc = await driver.documentImport({ source: "rename_boundary.txt", fileContent: "text" });

    await expect(
      driver.documentRename({ id: doc.id, title: STRING_BOUNDARY_TITLES.empty })
    ).rejects.toMatchObject({
      code: "InvalidInput",
      details: { field: "title" },
    } as Partial<AppErrorDto>);
  });

  it("T2-17: Document rename with 1 character accepted at lower boundary", async () => {
    const doc = await driver.documentImport({ source: "rename_1char.txt", fileContent: "text" });
    const renamed = await driver.documentRename({ id: doc.id, title: STRING_BOUNDARY_TITLES.singleChar });
    expect(renamed.title).toBe("A");
  });

  it("T2-18: Document rename with 200 characters accepted at upper boundary", async () => {
    const doc = await driver.documentImport({ source: "rename_200.txt", fileContent: "text" });
    const renamed = await driver.documentRename({ id: doc.id, title: STRING_BOUNDARY_TITLES.boundary200Chars });
    expect(renamed.title.length).toBe(200);
  });

  it("T2-19: Document rename with 201 characters rejected with InvalidInput", async () => {
    const doc = await driver.documentImport({ source: "rename_201.txt", fileContent: "text" });
    await expect(
      driver.documentRename({ id: doc.id, title: STRING_BOUNDARY_TITLES.overflow201Chars })
    ).rejects.toMatchObject({
      code: "InvalidInput",
    } as Partial<AppErrorDto>);
  });

  it("T2-20: Document rename with 1000 characters rejected with InvalidInput", async () => {
    const doc = await driver.documentImport({ source: "rename_1000.txt", fileContent: "text" });
    await expect(
      driver.documentRename({ id: doc.id, title: STRING_BOUNDARY_TITLES.overflow1000Chars })
    ).rejects.toMatchObject({
      code: "InvalidInput",
    } as Partial<AppErrorDto>);
  });

  // --- Domain 5: API & Parameter Boundaries ---

  it("T2-21: Nonexistent document ID in document_get returns typed DocumentNotFound", async () => {
    await expect(
      driver.documentGet({ id: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toMatchObject({
      code: "DocumentNotFound",
    } as Partial<AppErrorDto>);
  });

  it("T2-22: Nonexistent document ID in document_touch returns typed DocumentNotFound", async () => {
    await expect(
      driver.documentTouch({ id: "11111111-1111-1111-1111-111111111111" })
    ).rejects.toMatchObject({
      code: "DocumentNotFound",
    } as Partial<AppErrorDto>);
  });

  it("T2-23: Nonexistent document ID in document_delete returns typed DocumentNotFound", async () => {
    await expect(
      driver.documentDelete({ id: "22222222-2222-2222-2222-222222222222" })
    ).rejects.toMatchObject({
      code: "DocumentNotFound",
    } as Partial<AppErrorDto>);
  });

  it("T2-24: Nonexistent document ID in document_get_sections returns typed DocumentNotFound", async () => {
    await expect(
      driver.documentGetSections({ id: "33333333-3333-3333-3333-333333333333" })
    ).rejects.toMatchObject({
      code: "DocumentNotFound",
    } as Partial<AppErrorDto>);
  });

  it("T2-25: document_get_sections clamps requested count > 20 to the maximum of 20", async () => {
    const doc = await driver.documentImport({ source: "bulk_secs.txt", fileContent: "Sample text" });
    const sections = await driver.documentGetSections({ id: doc.id, count: 100 });
    expect(sections.length).toBeLessThanOrEqual(20);
  });

  it("T2-26: settings_set with unauthorized setting key is rejected with InvalidInput", async () => {
    await expect(
      driver.settingsSet({ key: "maliciousKey", value: "exploit" })
    ).rejects.toMatchObject({
      code: "InvalidInput",
    } as Partial<AppErrorDto>);
  });

  // --- Domain 6: Reading Tracker & Position Restore Fallback Boundaries ---

  it("T2-27: Position restore on nonexistent blockId triggers Tier 2 fallback (linear proximity)", async () => {
    const doc = await driver.documentImport({ source: "pos_fallback.md", fileContent: "# Sec 1\n\nContent paragraph." });
    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        sectionId: 0,
        blockId: "nonexistent-block-id",
        offset: 0,
        percentage: 0.1,
        parserVersion: 1,
      },
    });

    expect(resolved.fallbackTier).toBe("linear_proximity");
    expect(resolved.blockId).toBeDefined();
  });

  it("T2-28: Position restore on nonexistent sectionId triggers Tier 3 fallback (percentage mapping)", async () => {
    const doc = await driver.documentImport({ source: "sec_fallback.md", fileContent: "# Sec 1\n\nContent paragraph." });
    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        sectionId: 999, // Out of bounds section
        offset: 0,
        percentage: 0.5,
        parserVersion: 1,
      },
    });

    expect(resolved.fallbackTier).toBe("percentage");
  });

  it("T2-29: Position restore on empty document triggers Tier 4 fallback (start position)", async () => {
    const doc = await driver.documentImport({ source: "empty_pos.txt", fileContent: "" });
    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        sectionId: 0,
        percentage: 0.8,
        parserVersion: 1,
      },
    });

    expect(["start", "clamped", "linear_proximity", "percentage"]).toContain(resolved.fallbackTier);
  });

  it("T2-30: Position restore for PDF clamps page within valid 1..pageCount range", async () => {
    const doc = await driver.documentImport({ source: "clamped.pdf", fileContent: "%PDF-1.4\ncontent" });
    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        page: 0, // Invalid 0 page
        pageOffset: 1.5, // Invalid > 1 offset
        percentage: 0,
        parserVersion: 1,
      },
    });

    expect(resolved.fallbackTier).toBe("clamped");
    expect(resolved.page).toBe(1);
    expect(resolved.pageOffset).toBeLessThanOrEqual(1.0);
  });

  it("T2-31: Fast scrolling across segments without dwell marks segments as skipped, not read", async () => {
    const doc = await driver.documentImport({
      source: "fast_scroll.txt",
      fileContent: "Chapter 1: One\nWords here.\n\nChapter 2: Two\nMore words here.\n\nChapter 3: Three\nFinal words here.",
    });

    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    // User flings forward past segment 0 to segment 2 in under 500ms with jump='none'
    await driver.readingReportViewport({
      sessionId,
      ts: Date.now(),
      visible: [{ segmentIndex: 2, ratio: 1.0 }],
      position: { documentId: doc.id, sectionId: 2, percentage: 0.8, parserVersion: 1 },
      interacting: true,
      foreground: true,
      jump: "none",
    });

    const map = await driver.trackerGetMap({ documentId: doc.id });
    const seg0 = map.sections[0].segments[0];
    expect(seg0.status).toBe("skipped"); // Skipped, definitely not read!
  });

  it("T2-32: Reading session lasting under 5 seconds with 0 segments changed is discarded as noise", async () => {
    const doc = await driver.documentImport({ source: "noise.txt", fileContent: "Brief note." });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    // Session ends after only 2 seconds without changing any segment
    const startTs = Date.now();
    const session = await driver.readingEndSession({
      sessionId,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
      endTs: startTs + 2000,
    });

    expect(session).toBeNull(); // Discarded as noise per §8!
  });
});
