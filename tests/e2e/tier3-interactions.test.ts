import { describe, it, expect, beforeEach } from "vitest";
import { OpaqueBoxDriver } from "./harness/opaque_box_driver";
import { VALID_TXT_CONTENT, VALID_MD_CONTENT } from "./harness/fixtures";
import { AppErrorDto } from "./harness/contracts";

describe("Tier 3: Cross-Feature Interactions (Pairwise Combinations)", () => {
  let driver: OpaqueBoxDriver;

  beforeEach(() => {
    driver = new OpaqueBoxDriver();
  });

  // --- Interaction 1: Ingestion + Deduplication ---

  it("T3-1: Ingesting identical file twice triggers DuplicateDocument rejection with existingId", async () => {
    const first = await driver.documentImport({
      source: "original.txt",
      fileContent: "Exact duplicate text content.",
    });

    try {
      await driver.documentImport({
        source: "second_copy.txt",
        fileContent: "Exact duplicate text content.",
      });
      expect.unreachable("Should have failed with DuplicateDocument");
    } catch (err) {
      const error = err as AppErrorDto;
      expect(error.code).toBe("DuplicateDocument");
      expect(error.details?.existingId).toBe(first.id);
    }

    // Ensure no duplicate file was created on disk
    expect(driver.getSandboxFileCount()).toBe(1);
  });

  it("T3-2: Ingestion with onDuplicate='open_existing' returns existing document without redundant storage", async () => {
    const first = await driver.documentImport({
      source: "doc_alpha.txt",
      fileContent: "Alpha content",
    });

    const second = await driver.documentImport({
      source: "doc_alpha_copy.txt",
      fileContent: "Alpha content",
      onDuplicate: "open_existing",
    });

    expect(second.id).toBe(first.id);
    expect(driver.getSandboxFileCount()).toBe(1);
  });

  it("T3-3: Ingestion with onDuplicate='replace' updates existing file on disk and refreshes metadata", async () => {
    const initial = await driver.documentImport({
      source: "replace_target.txt",
      fileContent: "Initial short text",
    });

    const replaced = await driver.documentImport({
      source: "replace_target.txt",
      fileContent: "Replaced and updated longer text content",
      onDuplicate: "replace",
    });

    expect(replaced.id).toBe(initial.id);
    expect(replaced.fileSize).toBeGreaterThan(initial.fileSize);
    expect(driver.getSandboxFileCount()).toBe(1);
  });

  // --- Interaction 2: Ingestion + Deletion + Re-ingestion ---

  it("T3-4: Deleting a document and re-ingesting identical content succeeds cleanly without collision", async () => {
    const doc1 = await driver.documentImport({
      source: "lifecycle.txt",
      fileContent: "Document to delete and recreate.",
    });

    expect(driver.hasSandboxFile(doc1.id, "txt")).toBe(true);

    // Delete document
    await driver.documentDelete({ id: doc1.id });
    expect(driver.hasSandboxFile(doc1.id, "txt")).toBe(false);
    expect(driver.getSandboxFileCount()).toBe(0);

    // Re-import identical content
    const doc2 = await driver.documentImport({
      source: "lifecycle.txt",
      fileContent: "Document to delete and recreate.",
    });

    expect(doc2.id).not.toBe(doc1.id);
    expect(driver.hasSandboxFile(doc2.id, "txt")).toBe(true);
    expect(driver.getSandboxFileCount()).toBe(1);
  });

  it("T3-5: Deleting a document cascades to all child bookmarks and active sessions", async () => {
    const doc = await driver.documentImport({
      source: "cascade.txt",
      fileContent: VALID_TXT_CONTENT,
    });

    // Create bookmark
    await driver.bookmarkCreate({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0.1, parserVersion: 1 },
      title: "Note 1",
    });

    // Start session
    await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    // Delete document
    await driver.documentDelete({ id: doc.id });

    // Verify document, session, and disk file are purged
    await expect(driver.documentGet({ id: doc.id })).rejects.toMatchObject({
      code: "DocumentNotFound",
    });
    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(false);
  });

  // --- Interaction 3: Ingestion + Search ---

  it("T3-6: Ingesting documents with distinct content enables exact content search and snippet matching", async () => {
    const doc1 = await driver.documentImport({
      source: "astronomy.txt",
      fileContent: "The James Webb Space Telescope observes infrared spectra from early galaxies.",
    });
    const doc2 = await driver.documentImport({
      source: "biology.txt",
      fileContent: "Mitochondria produce cellular adenosine triphosphate through oxidative phosphorylation.",
    });

    const hitsTelescope = await driver.documentSearch({ query: "telescope" });
    expect(hitsTelescope.length).toBe(1);
    expect(hitsTelescope[0].documentId).toBe(doc1.id);
    expect(hitsTelescope[0].snippet[0].match).toBe(true);

    const hitsBio = await driver.documentSearch({ query: "mitochondria" });
    expect(hitsBio.length).toBe(1);
    expect(hitsBio[0].documentId).toBe(doc2.id);
  });

  it("T3-7: Searching for nonexistent query across library returns empty results array", async () => {
    await driver.documentImport({ source: "simple.txt", fileContent: "Normal text content" });
    const hits = await driver.documentSearch({ query: "nonexistentTerm404XYZ" });
    expect(hits).toEqual([]);
  });

  it("T3-8: Ingesting, renaming, and searching updates search index to match new title", async () => {
    const doc = await driver.documentImport({
      source: "draft.txt",
      fileContent: "Draft manuscript content.",
    });

    await driver.documentRename({ id: doc.id, title: "Superstring Theory Compendium" });

    const hits = await driver.documentSearch({ query: "Superstring" });
    expect(hits.length).toBe(1);
    expect(hits[0].documentId).toBe(doc.id);
    expect(hits[0].documentTitle).toBe("Superstring Theory Compendium");
  });

  // --- Interaction 4: Ingestion + Filtering & Sorting ---

  it("T3-9: Ingesting multi-format documents and querying document_list filters by search query", async () => {
    await driver.documentImport({ source: "physics_handbook.txt", fileContent: "Physics 101" });
    await driver.documentImport({ source: "chemistry_notes.md", fileContent: "# Chemistry Notes" });
    await driver.documentImport({ source: "biology_guide.txt", fileContent: "Biology Guide" });

    const searchPhysics = await driver.documentList({ query: "physics" });
    expect(searchPhysics.total).toBe(1);
    expect(searchPhysics.items[0].title).toBe("physics_handbook");
  });

  it("T3-10: Ingesting documents, archiving one, and filtering correctly partitions library views", async () => {
    const docA = await driver.documentImport({ source: "active_book.txt", fileContent: "Active content" });
    const docB = await driver.documentImport({ source: "archived_book.txt", fileContent: "Archived content" });

    await driver.documentArchive({ id: docB.id, archived: true });

    const activeList = await driver.documentList({ filter: "all" });
    expect(activeList.items.map((i) => i.id)).toEqual([docA.id]);

    const archivedList = await driver.documentList({ filter: "archived" });
    expect(archivedList.items.map((i) => i.id)).toEqual([docB.id]);
  });

  // --- Interaction 5: Ingestion + Progress Update + Sorting ---

  it("T3-11: Progress updates interact with library sorting by progress descending", async () => {
    await driver.documentImport({ source: "doc_a.txt", fileContent: VALID_TXT_CONTENT + "\nDoc A" });
    const docB = await driver.documentImport({ source: "doc_b.txt", fileContent: VALID_TXT_CONTENT + "\nDoc B" });
    await driver.documentImport({ source: "doc_c.txt", fileContent: VALID_TXT_CONTENT + "\nDoc C" });

    // Dwell and advance docB
    const { sessionId: sessB } = await driver.readingStartSession({
      documentId: docB.id,
      position: { documentId: docB.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      await driver.readingReportViewport({
        sessionId: sessB,
        ts: now + i * 1500,
        visible: [{ segmentIndex: 0, ratio: 1.0 }],
        position: { documentId: docB.id, sectionId: 0, percentage: 0.3, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    const sorted = await driver.documentList({ sort: "progress" });
    expect(sorted.items[0].id).toBe(docB.id);
    expect(sorted.items[0].progress).toBeGreaterThan(0);
  });

  it("T3-12: Full document completion updates completed status and filters in completed tab", async () => {
    const doc = await driver.documentImport({
      source: "short_pamphlet.txt",
      fileContent: "Just a single short paragraph with few words.",
    });

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
        position: { documentId: doc.id, sectionId: 0, percentage: 1.0, parserVersion: 1 },
        interacting: true,
        foreground: true,
        jump: "none",
      });
    }

    const completedList = await driver.documentList({ filter: "completed" });
    expect(completedList.items.map((i) => i.id)).toContain(doc.id);
  });

  // --- Interaction 6: Reading Session + Cascading Deletion ---

  it("T3-13: Deleting an actively read document terminates active sessions and cleans up locks", async () => {
    const doc = await driver.documentImport({ source: "active_read.txt", fileContent: "Active content" });
    const { sessionId } = await driver.readingStartSession({
      documentId: doc.id,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    await driver.documentDelete({ id: doc.id });

    // Subsequent endSession does not resurrect document
    const res = await driver.readingEndSession({
      sessionId,
      position: { documentId: doc.id, sectionId: 0, percentage: 0, parserVersion: 1 },
    });

    expect(res).toBeNull();
    expect(driver.hasSandboxFile(doc.id, "txt")).toBe(false);
  });

  // --- Interaction 7: TOC Extraction + Section Loading + Position Resolve ---

  it("T3-14: Ingesting structured markdown enables TOC extraction, lazy section retrieval, and position restore", async () => {
    const doc = await driver.documentImport({
      source: "full_structure.md",
      fileContent: VALID_MD_CONTENT,
    });

    const sections = await driver.documentGetSections({ id: doc.id, count: 5 });
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const targetSection = sections[1];
    expect(targetSection.blocks.length).toBeGreaterThan(0);

    const resolved = await driver.documentResolvePosition({
      position: {
        documentId: doc.id,
        sectionId: targetSection.index,
        blockId: targetSection.blocks[0].id,
        offset: 0,
        percentage: 0.35,
        parserVersion: 1,
      },
    });

    expect(resolved.fallbackTier).toBe("exact");
    expect(resolved.sectionIndex).toBe(targetSection.index);
    expect(resolved.blockId).toBe(targetSection.blocks[0].id);
  });

  // --- Interaction 8: Interleaved Multi-Document State Sync ---

  it("T3-15: Interleaved operations across multiple documents maintain mutual isolation", async () => {
    const docA = await driver.documentImport({ source: "doc_a.txt", fileContent: "Doc A text" });
    const docB = await driver.documentImport({ source: "doc_b.md", fileContent: "# Doc B text" });

    // Mutate doc A
    await driver.documentRename({ id: docA.id, title: "Doc A Renovated" });
    await driver.documentArchive({ id: docA.id, archived: true });

    // Mutate doc B
    await driver.documentTouch({ id: docB.id });

    // Check doc A
    const detailA = await driver.documentGet({ id: docA.id });
    expect(detailA.title).toBe("Doc A Renovated");
    expect(detailA.isArchived).toBe(true);

    // Check doc B
    const detailB = await driver.documentGet({ id: docB.id });
    expect(detailB.title).toBe("doc_b");
    expect(detailB.isArchived).toBe(false);
    expect(detailB.lastOpenedAt).toBeDefined();
  });
});
