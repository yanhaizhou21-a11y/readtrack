import { describe, it, expect, beforeEach } from "vitest";
import { OpaqueBoxDriver } from "./harness/opaque_box_driver";
import { VALID_TXT_CONTENT, VALID_MD_CONTENT, PDF_MAGIC_BYTES } from "./harness/fixtures";
import { AppErrorDto } from "./harness/contracts";

describe("Tier 4: Real-World Application Scenarios (Multi-Step User Workflows)", () => {
  let driver: OpaqueBoxDriver;

  beforeEach(() => {
    driver = new OpaqueBoxDriver();
  });

  it("Scenario 1: End-to-End Researcher Workflow (Import, TOC scan, dwell reading, bookmark, progress)", async () => {
    // Step 1: Researcher imports academic Markdown paper
    const paper = await driver.documentImport({
      source: "research/quantum_computing.md",
      fileContent: VALID_MD_CONTENT,
    });
    expect(paper.parseStatus).toBe("ready");
    expect(paper.sectionCount).toBeGreaterThanOrEqual(3);

    // Step 2: Opens document in reader shell (touch timestamp)
    await driver.documentTouch({ id: paper.id });
    const detailBefore = await driver.documentGet({ id: paper.id });
    expect(detailBefore.lastOpenedAt).toBeDefined();

    // Step 3: Inspects TOC and navigates to Section 1
    const sections = await driver.documentGetSections({ id: paper.id, count: 5 });
    const sec1 = sections[1];
    expect(sec1).toBeDefined();

    // Step 4: Starts reading session
    const { sessionId } = await driver.readingStartSession({
      documentId: paper.id,
      position: {
        documentId: paper.id,
        sectionId: sec1.index,
        blockId: sec1.blocks[0].id,
        percentage: 0.1,
        parserVersion: 1,
      },
    });

    // Step 5: Dwells in reading zone across multiple viewport reports
    const startTime = Date.now();
    for (let i = 0; i < 6; i++) {
      await driver.readingReportViewport({
        sessionId,
        ts: startTime + i * 1500,
        visible: [{ segmentIndex: 1, ratio: 0.85 }],
        position: {
          documentId: paper.id,
          sectionId: sec1.index,
          blockId: sec1.blocks[0].id,
          percentage: 0.2,
          parserVersion: 1,
        },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    // Step 6: Verifies segment transitioned to 'read'
    const map = await driver.trackerGetMap({ documentId: paper.id });
    const targetSegment = map.sections.flatMap((s) => s.segments).find((seg) => seg.index === 1);
    expect(targetSegment?.status).toBe("read");

    // Step 7: Creates an insight bookmark
    const bookmark = await driver.bookmarkCreate({
      documentId: paper.id,
      position: {
        documentId: paper.id,
        sectionId: sec1.index,
        blockId: sec1.blocks[0].id,
        percentage: 0.2,
        parserVersion: 1,
      },
      title: "Key Qubit Gate Fidelity Metric",
      note: "Surface codes require 99.9% fidelity.",
    });
    expect(bookmark.title).toBe("Key Qubit Gate Fidelity Metric");

    // Step 8: Ends reading session and verifies session metrics
    const session = await driver.readingEndSession({
      sessionId,
      position: {
        documentId: paper.id,
        sectionId: sec1.index,
        percentage: 0.25,
        parserVersion: 1,
      },
      endTs: startTime + 9000,
    });

    expect(session).not.toBeNull();
    expect(session?.durationSeconds).toBeGreaterThanOrEqual(5);

    const detailAfter = await driver.documentGet({ id: paper.id });
    expect(detailAfter.sessionCount).toBe(1);
    expect(detailAfter.totalReadMs).toBeGreaterThan(0);
    expect(detailAfter.progress).toBeGreaterThan(0);
  });

  it("Scenario 2: Rapid Multi-Format Ingestion & Library Curation", async () => {
    // Step 1: Ingest batch of books
    const book1 = await driver.documentImport({ source: "novel.txt", fileContent: VALID_TXT_CONTENT });
    const book2 = await driver.documentImport({ source: "guide.md", fileContent: VALID_MD_CONTENT });
    const book3 = await driver.documentImport({ source: "paper.pdf", fileContent: PDF_MAGIC_BYTES });

    expect(driver.getSandboxFileCount()).toBe(3);

    // Step 2: Live title search
    const searchRes = await driver.documentList({ query: "guide" });
    expect(searchRes.items.length).toBe(1);
    expect(searchRes.items[0].id).toBe(book2.id);

    // Step 3: Rename book
    const renamed = await driver.documentRename({ id: book1.id, title: "The Veridia Chronicles" });
    expect(renamed.title).toBe("The Veridia Chronicles");

    // Step 4: Archive finished book
    await driver.documentArchive({ id: book3.id, archived: true });

    // Step 5: Verify partitioning between active and archived views
    const active = await driver.documentList({ filter: "all" });
    expect(active.items.map((i) => i.id)).toEqual(expect.arrayContaining([book1.id, book2.id]));
    expect(active.items.map((i) => i.id)).not.toContain(book3.id);

    const archived = await driver.documentList({ filter: "archived" });
    expect(archived.items.map((i) => i.id)).toContain(book3.id);
  });

  it("Scenario 3: Accidental Duplicate Ingestion and Conflict Resolution", async () => {
    // Step 1: User imports report
    const original = await driver.documentImport({
      source: "finance/q3_report.txt",
      fileContent: "Consolidated Q3 Financial Results.",
    });

    // Step 2: User forgets and imports identical report
    try {
      await driver.documentImport({
        source: "downloads/q3_report_copy.txt",
        fileContent: "Consolidated Q3 Financial Results.",
      });
      expect.unreachable("Duplicate should have thrown");
    } catch (err) {
      const error = err as AppErrorDto;
      expect(error.code).toBe("DuplicateDocument");
      expect(error.details?.existingId).toBe(original.id);
    }

    // Step 3: User resolves by selecting 'open_existing'
    const existing = await driver.documentImport({
      source: "downloads/q3_report_copy.txt",
      fileContent: "Consolidated Q3 Financial Results.",
      onDuplicate: "open_existing",
    });

    expect(existing.id).toBe(original.id);
    expect(driver.getSandboxFileCount()).toBe(1);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("Scenario 4: Interrupted Reading Session and 5-Tier Crash Recovery", async () => {
    // Step 1: Import document and start reading
    const doc = await driver.documentImport({
      source: "crash_recovery_test.md",
      fileContent: VALID_MD_CONTENT,
    });

    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    // Step 2: Advance to specific block
    const sections = await driver.documentGetSections({ id: doc.id });
    const targetBlock = sections[0].blocks[1] || sections[0].blocks[0];

    await driver.readingReportViewport({
      sessionId,
      ts: Date.now(),
      visible: [{ segmentIndex: 0, ratio: 1.0 }],
      position: {
        documentId: doc.id,
        sectionId: 0,
        blockId: targetBlock.id,
        offset: 12,
        percentage: 0.15,
        parserVersion: 1,
      },
      interacting: true,
      foreground: true,
      jump: "none",
    });

    // Step 3: Simulate app kill / restart without clean endSession
    // On restart, app loads saved position and resolves it
    const lastDetail = await driver.documentGet({ id: doc.id });
    expect(lastDetail.position).toBeDefined();

    const restored = await driver.documentResolvePosition({
      position: lastDetail.position!,
    });

    expect(restored.fallbackTier).toBe("exact");
    expect(restored.blockId).toBe(targetBlock.id);
    expect(restored.offset).toBe(12);
  });

  it("Scenario 5: Complete Document Lifecycle and Safe Purge (Zero Disk Residue)", async () => {
    // Step 1: Ingest document
    const doc = await driver.documentImport({
      source: "sensitive_archive.txt",
      fileContent: "Classified project specifications and blueprints.",
    });

    // Step 2: Add annotations and reading history
    await driver.bookmarkCreate({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
      title: "Confidential Section",
    });

    const hitsBefore = await driver.documentSearch({ query: "Classified" });
    expect(hitsBefore.length).toBe(1);
    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(true);

    // Step 3: Execute cascading delete
    await driver.documentDelete({ id: doc.id });

    // Step 4: Verify complete purge
    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(false);
    expect(driver.getSandboxFileCount()).toBe(0);

    const hitsAfter = await driver.documentSearch({ query: "Classified" });
    expect(hitsAfter).toEqual([]);

    await expect(driver.documentGet({ id: doc.id })).rejects.toMatchObject({
      code: "DocumentNotFound",
    });
  });

  it("Scenario 6: Reading Velocity & Anti-Cheating Speed-Reader Validation", async () => {
    // Step 1: Ingest multi-segment document
    const doc = await driver.documentImport({
      source: "speed_test.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    // Step 2: User flings rapidly forward across all segments without dwelling (<1s)
    await driver.readingReportViewport({
      sessionId,
      ts: Date.now(),
      visible: [{ segmentIndex: 2, ratio: 1.0 }],
      position: { documentId: doc.id, sectionId: 2, percentage: 0.9, parserVersion: 1 },
      interacting: true,
      foreground: true,
      jump: "none",
    });

    // Verify skipped segments are NOT marked read
    let map = await driver.trackerGetMap({ documentId: doc.id });
    const seg0 = map.sections[0].segments[0];
    expect(seg0.status).toBe("skipped");

    const progressAfterFling = await driver.readingGetProgress({ documentId: doc.id });
    expect(progressAfterFling.progressPercent).toBe(0);

    // Step 3: User returns to segment 0 and dwells patiently (> required dwell time)
    const dwellStart = Date.now();
    for (let i = 0; i < 7; i++) {
      await driver.readingReportViewport({
        sessionId,
        ts: dwellStart + i * 1500,
        visible: [{ segmentIndex: 0, ratio: 1.0 }],
        position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "resume",
      });
    }

    map = await driver.trackerGetMap({ documentId: doc.id });
    const seg0After = map.sections[0].segments[0];
    expect(seg0After.status).toBe("read");

    const progressAfterDwell = await driver.readingGetProgress({ documentId: doc.id });
    expect(progressAfterDwell.progressPercent).toBeGreaterThan(0);
  });

  it("Scenario 7: Offline Local-First Reading & Settings Integrity", async () => {
    // Step 1: Update reader preferences
    await driver.settingsSet({ key: "fontFamily", value: "Newsreader" });
    await driver.settingsSet({ key: "fontSize", value: 20 });
    await driver.settingsSet({ key: "theme", value: "sepia" });

    const settings = await driver.settingsGetAll();
    expect(settings.fontFamily).toBe("Newsreader");
    expect(settings.fontSize).toBe(20);
    expect(settings.theme).toBe("sepia");

    // Step 2: Ingest local document
    const doc = await driver.documentImport({
      source: "offline_handbook.txt",
      fileContent: "Completely local, on-device reading handbook.",
    });

    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(true);
    expect(doc.parseStatus).toBe("ready");
  });
});
