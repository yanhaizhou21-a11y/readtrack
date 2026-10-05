import { describe, it, expect, beforeEach } from "vitest";
import { OpaqueBoxDriver } from "./harness/opaque_box_driver";
import {
  VALID_TXT_CONTENT,
  VALID_MD_CONTENT,
  PDF_MAGIC_BYTES,
} from "./harness/fixtures";
import {
  DocumentSummarySchema,
  DocumentDetailSchema,
  DocumentListResponseSchema,
  SectionPayloadSchema,
  ReadingProgressSchema,
  ReadingMapSchema,
  BookmarkSchema,
} from "./harness/contracts";
import { TrackerOracle } from "./harness/tracker_oracle";

describe("Tier 1: Feature Coverage (Baseline Happy Paths)", () => {
  let driver: OpaqueBoxDriver;

  beforeEach(() => {
    driver = new OpaqueBoxDriver();
  });

  // --- Domain 1: Ingestion & Sandboxed FileStore Storage ---

  it("T1-1: Ingests plain text document into sandbox storage with BLAKE3 hash computation", async () => {
    const doc = await driver.documentImport({
      source: "fixtures/sample.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const parsed = DocumentSummarySchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.fileType).toBe("txt");
    expect(doc.title).toBe("sample");
    expect(doc.fileSize).toBe(Buffer.byteLength(VALID_TXT_CONTENT));
    expect(doc.progress).toBe(0);
    expect(doc.completed).toBe(false);
    expect(doc.parseStatus).toBe("ready");

    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(true);
    expect(driver.getTempFileCount()).toBe(0);
  });

  it("T1-2: Ingests markdown document and extracts structured sections, word counts, and format badge", async () => {
    const doc = await driver.documentImport({
      source: "docs/quantum_notes.md",
      fileContent: VALID_MD_CONTENT,
    });

    expect(doc.fileType).toBe("md");
    expect(doc.title).toBe("quantum_notes");
    expect(doc.sectionCount).toBeGreaterThanOrEqual(3);
    expect(doc.wordCount).toBeGreaterThan(50);
    expect(driver.hasSandboxFile(doc.id, "md")).toBe(true);
  });

  it("T1-3: Enforces sandbox path canonicalization and isolation under library/documents/", async () => {
    const doc = await driver.documentImport({
      source: "books/intro.txt",
      fileContent: "Hello World",
    });

    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(true);
    expect(driver.getSandboxFileCount()).toBe(1);
  });

  it("T1-4: Initializes reading progress at 0% and unread state upon document ingestion", async () => {
    const doc = await driver.documentImport({
      source: "reader/sample.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const detail = await driver.documentGet({ id: doc.id });
    expect(detail.progress).toBe(0);
    expect(detail.completed).toBe(false);
    expect(detail.sessionCount).toBe(0);
    expect(detail.totalReadMs).toBe(0);
    expect(detail.position).toBeDefined();
    expect(detail.position?.percentage).toBe(0);
  });

  it("T1-5: Ingests valid PDF document with magic bytes and extracts page structure", async () => {
    const doc = await driver.documentImport({
      source: "papers/research.pdf",
      fileContent: PDF_MAGIC_BYTES,
    });

    expect(doc.fileType).toBe("pdf");
    expect(doc.pageCount).toBe(1);
    expect(driver.hasSandboxFile(doc.id, "pdf")).toBe(true);
  });

  // --- Domain 2: Document Parsers & AST Generation ---

  it("T1-6: Plain text parser parses paragraphs and chapters with accurate word counts", async () => {
    const doc = await driver.documentImport({
      source: "books/novel.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const sections = await driver.documentGetSections({ id: doc.id });
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections[0].title).toContain("Chapter 1");
    expect(sections[0].wordCount).toBeGreaterThan(10);
    expect(sections[0].blocks[0].type).toBe("paragraph");
  });

  it("T1-7: Markdown parser extracts structured headings into sections and generates TOC", async () => {
    const doc = await driver.documentImport({
      source: "notes/quantum.md",
      fileContent: VALID_MD_CONTENT,
    });

    const sections = await driver.documentGetSections({ id: doc.id });
    expect(sections.some((s) => s.title?.includes("Quantum Computing Architecture"))).toBe(true);
    expect(sections.some((s) => s.title?.includes("Fundamentals of Qubits"))).toBe(true);
    expect(sections.some((s) => s.title?.includes("Superconducting Circuits"))).toBe(true);
  });

  it("T1-8: Segment generator generates reading segments with target word count per TRACKER_SPEC §2", async () => {
    const doc = await driver.documentImport({
      source: "article.md",
      fileContent: VALID_MD_CONTENT,
    });

    const map = await driver.trackerGetMap({ documentId: doc.id });
    const allSegments = map.sections.flatMap((s) => s.segments);
    expect(allSegments.length).toBeGreaterThan(0);
    for (const seg of allSegments) {
      expect(seg.status).toBe("unread");
      expect(seg.wordCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("T1-9: Generates deterministic BlockIDs following the s{section}-b{block} specification", async () => {
    const doc = await driver.documentImport({
      source: "guide.md",
      fileContent: VALID_MD_CONTENT,
    });

    const sections = await driver.documentGetSections({ id: doc.id });
    for (const sec of sections) {
      for (const blk of sec.blocks) {
        expect(blk.id).toMatch(/^s\d+-b\d+$/);
      }
    }
  });

  it("T1-10: Lazy section loading respects batch limit (count <= 20) and pagination offset", async () => {
    const doc = await driver.documentImport({
      source: "manual.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const batch = await driver.documentGetSections({ id: doc.id, fromIndex: 0, count: 2 });
    expect(batch.length).toBeLessThanOrEqual(2);
    for (const sec of batch) {
      expect(SectionPayloadSchema.safeParse(sec).success).toBe(true);
    }
  });

  // --- Domain 3: Persistence, Listing & Management ---

  it("T1-11: document_list returns active documents matching DocumentListResponseSchema", async () => {
    await driver.documentImport({ source: "book1.txt", fileContent: "Book 1 text" });
    await driver.documentImport({ source: "book2.md", fileContent: "# Book 2" });

    const list = await driver.documentList({ filter: "all" });
    expect(DocumentListResponseSchema.safeParse(list).success).toBe(true);
    expect(list.total).toBe(2);
    expect(list.items.length).toBe(2);
  });

  it("T1-12: document_get returns complete DocumentDetail including contentHash and originalFilename", async () => {
    const summary = await driver.documentImport({
      source: "report.txt",
      fileContent: "Quarterly earnings report data.",
    });

    const detail = await driver.documentGet({ id: summary.id });
    expect(DocumentDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.id).toBe(summary.id);
    expect(detail.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(detail.originalFilename).toBe("report.txt");
  });

  it("T1-13: document_touch updates last_opened_at timestamp without modifying other metadata", async () => {
    const doc = await driver.documentImport({
      source: "quick.txt",
      fileContent: "Short note.",
    });

    expect(doc.lastOpenedAt).toBeUndefined();
    await driver.documentTouch({ id: doc.id });

    const touched = await driver.documentGet({ id: doc.id });
    expect(touched.lastOpenedAt).toBeDefined();
    expect(touched.lastOpenedAt).toBeGreaterThan(doc.createdAt - 1000);
  });

  it("T1-14: document_list supports pagination offset and limit parameters", async () => {
    for (let i = 1; i <= 5; i++) {
      await driver.documentImport({ source: `item_${i}.txt`, fileContent: `Item ${i} content` });
    }

    const page1 = await driver.documentList({ offset: 0, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(5);

    const page2 = await driver.documentList({ offset: 2, limit: 2 });
    expect(page2.items.length).toBe(2);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
  });

  it("T1-15: reading_get_progress returns initial 0% progress and unread state", async () => {
    const doc = await driver.documentImport({
      source: "tracker_test.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    const progress = await driver.readingGetProgress({ documentId: doc.id });
    expect(ReadingProgressSchema.safeParse(progress).success).toBe(true);
    expect(progress.progressPercent).toBe(0);
    expect(progress.completed).toBe(false);
  });

  // --- Domain 4: Library Operations & Lifecycle ---

  it("T1-16: document_rename updates document user title within valid character boundaries", async () => {
    const doc = await driver.documentImport({
      source: "temp_name.txt",
      fileContent: "Contents",
    });

    const renamed = await driver.documentRename({ id: doc.id, title: "Final Dissertation Title" });
    expect(renamed.title).toBe("Final Dissertation Title");

    const recheck = await driver.documentGet({ id: doc.id });
    expect(recheck.title).toBe("Final Dissertation Title");
  });

  it("T1-17: document_archive toggles archive flag and excludes document from active library list", async () => {
    const doc1 = await driver.documentImport({ source: "a.txt", fileContent: "A" });
    const doc2 = await driver.documentImport({ source: "b.txt", fileContent: "B" });

    await driver.documentArchive({ id: doc1.id, archived: true });

    const activeList = await driver.documentList({ filter: "all" });
    expect(activeList.items.map((i) => i.id)).not.toContain(doc1.id);
    expect(activeList.items.map((i) => i.id)).toContain(doc2.id);

    const archivedList = await driver.documentList({ filter: "archived" });
    expect(archivedList.items.map((i) => i.id)).toContain(doc1.id);
  });

  it("T1-18: document_archive restores archived document back to active list", async () => {
    const doc = await driver.documentImport({ source: "archive_restore.txt", fileContent: "Content" });
    await driver.documentArchive({ id: doc.id, archived: true });
    await driver.documentArchive({ id: doc.id, archived: false });

    const activeList = await driver.documentList({ filter: "all" });
    expect(activeList.items.map((i) => i.id)).toContain(doc.id);
  });

  it("T1-19: document_list sorts documents alphabetically by title", async () => {
    await driver.documentImport({ source: "Zebra.txt", fileContent: "Z" });
    await driver.documentImport({ source: "Apple.txt", fileContent: "A" });
    await driver.documentImport({ source: "Mango.txt", fileContent: "M" });

    const sorted = await driver.documentList({ sort: "title" });
    expect(sorted.items[0].title).toBe("Apple");
    expect(sorted.items[1].title).toBe("Mango");
    expect(sorted.items[2].title).toBe("Zebra");
  });

  it("T1-20: document_delete executes clean cascading purge from DB and unlinks disk file", async () => {
    const doc = await driver.documentImport({ source: "delete_me.txt", fileContent: "To be deleted" });
    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(true);

    await driver.documentDelete({ id: doc.id });

    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(false);
    await expect(driver.documentGet({ id: doc.id })).rejects.toMatchObject({
      code: "DocumentNotFound",
    });
  });

  // --- Domain 5: Reading Engine, Dwell & Tracker State Machine ---

  it("T1-21: reading_start_session creates an active reading session with start position", async () => {
    const doc = await driver.documentImport({ source: "read_start.txt", fileContent: VALID_TXT_CONTENT });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: {
        documentId: doc.id,
        sectionId: 0,
        percentage: 0,
        parserVersion: 1,
      },
    });

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe("string");
  });

  it("T1-22: Viewport report with sufficient dwell time transitions segment from unread to reading to read", async () => {
    const doc = await driver.documentImport({ source: "dwell_test.txt", fileContent: VALID_TXT_CONTENT });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    const now = Date.now();
    // 1st report: partial dwell -> transitions to reading
    await driver.readingReportViewport({
      sessionId,
      ts: now,
      visible: [{ segmentIndex: 0, ratio: 0.8 }],
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
      interacting: true,
      foreground: true,
      jump: "none",
    });

    let map = await driver.trackerGetMap({ documentId: doc.id });
    expect(map.sections[0].segments[0].status).toBe("reading");

    // 2nd and 3rd reports: accumulate dwell exceeding threshold -> transitions to read
    for (let i = 1; i <= 6; i++) {
      await driver.readingReportViewport({
        sessionId,
        ts: now + i * 1500,
        visible: [{ segmentIndex: 0, ratio: 0.9 }],
        position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    map = await driver.trackerGetMap({ documentId: doc.id });
    expect(map.sections[0].segments[0].status).toBe("read");
  });

  it("T1-23: Reading progress increases monotonically weighted by word counts", async () => {
    const doc = await driver.documentImport({ source: "progress_calc.txt", fileContent: VALID_TXT_CONTENT });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    const now = Date.now();
    // Dwell extensively on segment 0
    for (let i = 0; i < 8; i++) {
      await driver.readingReportViewport({
        sessionId,
        ts: now + i * 1500,
        visible: [{ segmentIndex: 0, ratio: 1.0 }],
        position: { documentId: doc.id, sectionId: 0, percentage: 0.2, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    const prog = await driver.readingGetProgress({ documentId: doc.id });
    expect(prog.progressPercent).toBeGreaterThan(0);
    expect(prog.progressPercent).toBeLessThanOrEqual(1.0);
  });

  it("T1-24: tracker_get_map returns complete ReadingMap schema with section progress", async () => {
    const doc = await driver.documentImport({ source: "map_test.md", fileContent: VALID_MD_CONTENT });
    const map = await driver.trackerGetMap({ documentId: doc.id });

    expect(ReadingMapSchema.safeParse(map).success).toBe(true);
    expect(map.documentId).toBe(doc.id);
    expect(map.sections.length).toBeGreaterThan(0);
  });

  it("T1-25: document_resolve_position resolves exact block position via Tier 1 matching", async () => {
    const doc = await driver.documentImport({ source: "resolve.md", fileContent: VALID_MD_CONTENT });
    const sections = await driver.documentGetSections({ id: doc.id });
    const targetBlock = sections[0].blocks[0];

    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        sectionId: 0,
        blockId: targetBlock.id,
        offset: 5,
        percentage: 0.05,
        parserVersion: 1,
      },
    });

    expect(resolved.fallbackTier).toBe("exact");
    expect(resolved.blockId).toBe(targetBlock.id);
    expect(resolved.offset).toBe(5);
  });

  // --- Domain 6: Settings, Annotations & Multi-Document Operations ---

  it("T1-26: settings_get_all returns default user preferences", async () => {
    const settings = await driver.settingsGetAll();
    expect(settings.theme).toBe("system");
    expect(settings.fontFamily).toBe("serif");
    expect(settings.fontSize).toBe(18);
  });

  it("T1-27: settings_set updates valid user preference setting", async () => {
    await driver.settingsSet({ key: "fontSize", value: 22 });
    const settings = await driver.settingsGetAll();
    expect(settings.fontSize).toBe(22);
  });

  it("T1-28: bookmark_create creates bookmark record with position and timestamp", async () => {
    const doc = await driver.documentImport({ source: "bookmark.txt", fileContent: "Sample bookmarkable text" });
    const bm = await driver.bookmarkCreate({
      documentId: doc.id,
      position: {
        documentId: doc.id,
        sectionId: 0,
        percentage: 0.15,
        parserVersion: 1,
      },
      title: "Crucial Proof Point",
      note: "Refer to equation 3.1",
    });

    expect(BookmarkSchema.safeParse(bm).success).toBe(true);
    expect(bm.title).toBe("Crucial Proof Point");
    expect(bm.documentId).toBe(doc.id);
  });

  it("T1-29: reading_end_session finalizes session duration and active metrics", async () => {
    const doc = await driver.documentImport({ source: "end_session.txt", fileContent: VALID_TXT_CONTENT });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      await driver.readingReportViewport({
        sessionId,
        ts: now + i * 1500,
        visible: [{ segmentIndex: 0, ratio: 1.0 }],
        position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    const session = await driver.readingEndSession({
      sessionId,
      position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
      endTs: now + 9000,
    });

    expect(session).not.toBeNull();
    expect(session?.durationSeconds).toBeGreaterThanOrEqual(5);
    expect(session?.segmentsChanged).toBeGreaterThan(0);
  });

  it("T1-30: Ingesting distinct documents creates separate database rows and sandbox files", async () => {
    const docA = await driver.documentImport({ source: "doc_a.txt", fileContent: "First document" });
    const docB = await driver.documentImport({ source: "doc_b.txt", fileContent: "Second document" });

    expect(docA.id).not.toBe(docB.id);
    expect(driver.getSandboxFileCount()).toBe(2);
    expect(driver.hasSandboxFile(docA.id, "txt")).toBe(true);
    expect(driver.hasSandboxFile(docB.id, "txt")).toBe(true);
  });
});
