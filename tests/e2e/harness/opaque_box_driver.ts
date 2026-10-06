import { randomUUID } from "node:crypto";
import {
  AppErrorDto,
  Bookmark,
  BookmarkSchema,
  DocumentDetail,
  DocumentDetailSchema,
  DocumentListResponse,
  DocumentListResponseSchema,
  DocumentSummary,
  DocumentSummarySchema,
  FileType,
  LogicalPosition,
  ReadingMap,
  ReadingMapSchema,
  ReadingProgress,
  ReadingProgressSchema,
  ResolvedPosition,
  ResolvedPositionSchema,
  SearchHit,
  SectionPayload,
  SectionPayloadSchema,
  TocEntry,
  ViewportReport,
} from "./contracts";
import { computeContentHash } from "./blake3";
import { ReadingSegment, ReadingSessionRecord, TrackerOracle } from "./tracker_oracle";
import { MAX_FILE_SIZE_BYTES } from "./fixtures";

interface StoredDocument {
  summary: DocumentSummary;
  detail: DocumentDetail;
  sections: SectionPayload[];
  segments: ReadingSegment[];
  toc: TocEntry[];
  rawContent: string | Buffer;
  diskPath: string;
}

export class OpaqueBoxDriver {
  private documents = new Map<string, StoredDocument>();
  private activeSessions = new Map<string, ReadingSessionRecord>();
  private bookmarks = new Map<string, Bookmark[]>();
  private settings = new Map<string, unknown>([
    ["theme", "system"],
    ["fontFamily", "serif"],
    ["fontSize", 18],
    ["lineHeight", 1.6],
    ["readingZoneHeight", 0.6],
  ]);
  private sandboxDiskFiles = new Set<string>();
  private activeTempFiles = new Set<string>();

  constructor() {
    this.reset();
  }

  public reset() {
    this.documents.clear();
    this.activeSessions.clear();
    this.bookmarks.clear();
    this.sandboxDiskFiles.clear();
    this.activeTempFiles.clear();
  }

  public getSandboxFileCount(): number {
    return this.sandboxDiskFiles.size;
  }

  public getTempFileCount(): number {
    return this.activeTempFiles.size;
  }

  public hasSandboxFile(docId: string, fileType: string): boolean {
    return this.sandboxDiskFiles.has(`library/documents/${docId}.${fileType}`);
  }

  // --- IPC Commands ---

  /**
   * IPC `document_import`
   */
  public async documentImport(input: {
    source: string;
    fileContent?: string | Buffer;
    fileSize?: number;
    onDuplicate?: "ask" | "open_existing" | "replace";
  }): Promise<DocumentSummary> {
    const tempFileId = `tmp-${randomUUID()}`;
    this.activeTempFiles.add(tempFileId);

    try {
      // 1. Path traversal check (SECURITY.md §threat model)
      if (
        input.source.includes("../") ||
        input.source.includes("..\\") ||
        input.source.includes("\x00") ||
        input.source.startsWith("/") ||
        input.source.startsWith("C:\\") ||
        input.source.startsWith("c:\\") ||
        input.source.includes("Windows\\System32")
      ) {
        throw {
          code: "PermissionDenied",
          message: "ReadTrack doesn't have permission to access this file.",
          retryable: false,
        } as AppErrorDto;
      }

      // 2. Format extraction
      const parts = input.source.split(".");
      const ext = (parts[parts.length - 1] || "").toLowerCase() as FileType;
      const validExtensions: FileType[] = ["pdf", "docx", "rtf", "txt", "md", "epub"];
      if (!validExtensions.includes(ext)) {
        throw {
          code: "UnsupportedFormat",
          message: "This file type isn't supported yet.",
          details: { ext },
          retryable: false,
        } as AppErrorDto;
      }

      const content = input.fileContent ?? "";
      const sizeBytes = input.fileSize ?? (typeof content === "string" ? Buffer.byteLength(content) : content.length);

      // 3. File size check (200MB limit per SECURITY.md & PROJECT.md)
      if (sizeBytes > MAX_FILE_SIZE_BYTES) {
        throw {
          code: "InvalidDocument",
          message: "File exceeds the 200MB size limit.",
          retryable: false,
        } as AppErrorDto;
      }

      // 4. Magic bytes & corruption check
      if (ext === "pdf") {
        const header = typeof content === "string" ? content.slice(0, 5) : content.slice(0, 5).toString();
        if (!header.startsWith("%PDF-")) {
          throw {
            code: "InvalidDocument",
            message: "We couldn't open this document. The file may be corrupted or unsupported.",
            retryable: false,
          } as AppErrorDto;
        }
      }

      // 5. Streaming BLAKE3 content hash
      const contentHash = computeContentHash(content);

      // 6. Deduplication check
      const filename = input.source.split(/[/\\]/).pop() || input.source;
      const existingEntry = Array.from(this.documents.values()).find(
        (doc) => doc.detail.contentHash === contentHash || doc.detail.originalFilename === filename
      );

      if (existingEntry) {
        if (input.onDuplicate === "open_existing") {
          return DocumentSummarySchema.parse(existingEntry.summary);
        } else if (input.onDuplicate === "replace") {
          // Replace disk file and update metadata
          existingEntry.rawContent = content;
          existingEntry.summary.fileSize = sizeBytes;
          existingEntry.detail.contentHash = contentHash;
          return DocumentSummarySchema.parse(existingEntry.summary);
        } else {
          throw {
            code: "DuplicateDocument",
            message: "This document already exists.",
            details: { existingId: existingEntry.summary.id },
            retryable: false,
          } as AppErrorDto;
        }
      }

      // 7. Parse AST & sections
      const docId = randomUUID();
      const rawTitle = input.source.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "Untitled";
      const { sections, toc, segments, wordCount, pageCount } = this.parseDocumentAST(
        docId,
        ext,
        content
      );

      const now = Date.now();
      const diskPath = `library/documents/${docId}.${ext}`;

      const summary: DocumentSummary = {
        id: docId,
        title: rawTitle,
        author: undefined,
        fileType: ext,
        fileSize: sizeBytes,
        pageCount,
        wordCount,
        sectionCount: sections.length,
        progress: 0,
        completed: false,
        isArchived: false,
        createdAt: now,
        lastOpenedAt: undefined,
        thumbnailUrl: undefined,
        parseStatus: "ready",
      };

      const detail: DocumentDetail = {
        ...summary,
        originalFilename: input.source.split(/[/\\]/).pop() || input.source,
        mimeType: this.getMimeType(ext),
        contentHash,
        totalReadMs: 0,
        sessionCount: 0,
        lastReadAt: undefined,
        position: {
          documentId: docId,
          sectionId: 0,
          blockId: sections[0]?.blocks[0]?.id,
          offset: 0,
          percentage: 0,
          parserVersion: 1,
        },
      };

      // Commit to disk sandbox and DB
      this.sandboxDiskFiles.add(diskPath);
      this.documents.set(docId, {
        summary,
        detail,
        sections,
        segments,
        toc,
        rawContent: content,
        diskPath,
      });

      return DocumentSummarySchema.parse(summary);
    } finally {
      // Ingestion cleanup: always unlink temp file (Failure rollback)
      this.activeTempFiles.delete(tempFileId);
    }
  }

  /**
   * IPC `document_list`
   */
  public async documentList(input?: {
    filter?: "all" | "in_progress" | "completed" | "archived" | "recent_added" | "recent_opened";
    sort?: "recent_opened" | "recent_added" | "title" | "progress";
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<DocumentListResponse> {
    let docs = Array.from(this.documents.values()).map((d) => d.summary);

    // Filter
    const filter = input?.filter || "all";
    if (filter === "in_progress") {
      docs = docs.filter((d) => !d.isArchived && d.progress > 0 && !d.completed);
    } else if (filter === "completed") {
      docs = docs.filter((d) => !d.isArchived && d.completed);
    } else if (filter === "archived") {
      docs = docs.filter((d) => d.isArchived);
    } else if (filter === "all") {
      docs = docs.filter((d) => !d.isArchived);
    }

    // Query
    if (input?.query && input.query.trim().length > 0) {
      const q = input.query.toLowerCase().trim();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q) || (d.author && d.author.toLowerCase().includes(q)));
    }

    // Sort
    const sort = input?.sort || "recent_added";
    if (sort === "title") {
      docs.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "progress") {
      docs.sort((a, b) => b.progress - a.progress);
    } else if (sort === "recent_opened") {
      docs.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    } else {
      docs.sort((a, b) => b.createdAt - a.createdAt);
    }

    const total = docs.length;
    const offset = input?.offset || 0;
    const limit = input?.limit ?? 50;
    const items = docs.slice(offset, offset + limit);

    return DocumentListResponseSchema.parse({ items, total });
  }

  /**
   * IPC `document_get`
   */
  public async documentGet(input: { id: string }): Promise<DocumentDetail> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }
    return DocumentDetailSchema.parse(doc.detail);
  }

  /**
   * IPC `document_touch`
   */
  public async documentTouch(input: { id: string }): Promise<void> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }
    const now = Date.now();
    doc.summary.lastOpenedAt = now;
    doc.detail.lastOpenedAt = now;
  }

  /**
   * IPC `document_rename`
   */
  public async documentRename(input: { id: string; title: string }): Promise<DocumentSummary> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const trimmed = input.title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      throw {
        code: "InvalidInput",
        message: "Document title must be between 1 and 200 characters.",
        details: { field: "title" },
        retryable: false,
      } as AppErrorDto;
    }

    doc.summary.title = trimmed;
    doc.detail.title = trimmed;
    return DocumentSummarySchema.parse(doc.summary);
  }

  /**
   * IPC `document_archive`
   */
  public async documentArchive(input: { id: string; archived: boolean }): Promise<DocumentSummary> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }
    doc.summary.isArchived = input.archived;
    doc.detail.isArchived = input.archived;
    return DocumentSummarySchema.parse(doc.summary);
  }

  /**
   * IPC `document_delete`
   * Clean cascading delete: DB records + child entities + FTS index + physical file.
   */
  public async documentDelete(input: { id: string }): Promise<void> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    // 1. Cascading DB deletion
    this.documents.delete(input.id);
    this.bookmarks.delete(input.id);
    for (const [sessId, sess] of this.activeSessions.entries()) {
      if (sess.documentId === input.id) {
        this.activeSessions.delete(sessId);
      }
    }

    // 2. Unlink physical binary from sandbox disk
    this.sandboxDiskFiles.delete(doc.diskPath);
  }

  /**
   * IPC `document_get_sections`
   */
  public async documentGetSections(input: {
    id: string;
    fromIndex?: number;
    count?: number;
  }): Promise<SectionPayload[]> {
    const doc = this.documents.get(input.id);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const count = Math.min(20, input.count ?? 20);
    const fromIndex = input.fromIndex ?? 0;
    const slices = doc.sections.slice(fromIndex, fromIndex + count);
    return slices.map((s) => SectionPayloadSchema.parse(s));
  }

  /**
   * IPC `document_search`
   */
  public async documentSearch(input: {
    query: string;
    documentId?: string;
  }): Promise<SearchHit[]> {
    const results: SearchHit[] = [];
    const q = input.query.toLowerCase().trim();
    if (!q) return results;

    const targetDocs = input.documentId
      ? [this.documents.get(input.documentId)].filter((d): d is StoredDocument => Boolean(d))
      : Array.from(this.documents.values());

    for (const doc of targetDocs) {
      // Check title match
      if (doc.summary.title.toLowerCase().includes(q)) {
        results.push({
          kind: "title",
          documentId: doc.summary.id,
          documentTitle: doc.summary.title,
          snippet: [{ text: doc.summary.title, match: true }],
          position: doc.detail.position || {
            documentId: doc.summary.id,
            sectionId: 0,
            percentage: 0,
            parserVersion: 1,
          },
        });
      }

      // Check content match in sections
      for (const sec of doc.sections) {
        for (const blk of sec.blocks) {
          if (blk.text.toLowerCase().includes(q)) {
            results.push({
              kind: "content",
              documentId: doc.summary.id,
              documentTitle: doc.summary.title,
              sectionTitle: sec.title,
              snippet: [
                { text: blk.text.slice(0, 100), match: true },
              ],
              position: {
                documentId: doc.summary.id,
                sectionId: sec.index,
                blockId: blk.id,
                offset: 0,
                percentage: doc.summary.progress,
                parserVersion: 1,
              },
            });
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * IPC `document_resolve_position`
   */
  public async documentResolvePosition(input: {
    position: LogicalPosition;
  }): Promise<ResolvedPosition> {
    const doc = this.documents.get(input.position.documentId);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const availableSections = doc.sections.map((s) => {
      let cumulative = 0;
      return {
        index: s.index,
        blocks: s.blocks.map((b) => {
          const res = { id: b.id, charLength: b.text.length, linearPos: cumulative };
          cumulative += b.text.length;
          return res;
        }),
      };
    });

    const totalChars = doc.sections.reduce(
      (acc, s) => acc + s.blocks.reduce((bAcc, b) => bAcc + b.text.length, 0),
      0
    );

    const resolved = TrackerOracle.resolvePosition(input.position, totalChars, availableSections);
    return ResolvedPositionSchema.parse(resolved);
  }

  /**
   * Reading Tracker: `reading_start_session`
   */
  public async readingStartSession(input: {
    documentId: string;
    position: LogicalPosition;
  }): Promise<{ sessionId: string }> {
    const doc = this.documents.get(input.documentId);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const sessionId = randomUUID();
    const now = Date.now();
    const sessionRecord: ReadingSessionRecord = {
      sessionId,
      documentId: input.documentId,
      startedAt: now,
      lastHeartbeatAt: now,
      activeSeconds: 0,
      durationSeconds: 0,
      startPosition: input.position,
      segmentsChanged: 0,
      discardedAsNoise: false,
    };

    this.activeSessions.set(sessionId, sessionRecord);
    return { sessionId };
  }

  /**
   * Reading Tracker: `reading_report_viewport`
   */
  public async readingReportViewport(report: ViewportReport): Promise<void> {
    const session = this.activeSessions.get(report.sessionId);
    if (!session) return;

    const doc = this.documents.get(session.documentId);
    if (!doc) return;

    TrackerOracle.processViewportReport(doc.segments, session.lastHeartbeatAt, report, session);

    const { progress, completed } = TrackerOracle.computeProgress(doc.segments);
    doc.summary.progress = progress;
    doc.summary.completed = completed;
    doc.detail.progress = progress;
    doc.detail.completed = completed;
    doc.detail.position = report.position;
  }

  /**
   * Reading Tracker: `reading_end_session`
   */
  public async readingEndSession(input: {
    sessionId: string;
    position: LogicalPosition;
    endTs?: number;
  }): Promise<ReadingSessionRecord | null> {
    const session = this.activeSessions.get(input.sessionId);
    if (!session) return null;

    const endTs = input.endTs ?? Date.now();
    const doc = this.documents.get(session.documentId);
    if (doc) {
      doc.detail.sessionCount += 1;
      doc.detail.totalReadMs += session.activeSeconds * 1000;
      doc.detail.lastReadAt = endTs;
      doc.detail.position = input.position;
    }

    const finalized = TrackerOracle.endSession(session, endTs);
    this.activeSessions.delete(input.sessionId);
    return finalized;
  }

  /**
   * Reading Tracker: `reading_get_progress`
   */
  public async readingGetProgress(input: { documentId: string }): Promise<ReadingProgress> {
    const doc = this.documents.get(input.documentId);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const { progress, completed } = TrackerOracle.computeProgress(doc.segments);
    return ReadingProgressSchema.parse({
      documentId: input.documentId,
      progressPercent: progress,
      completed,
      completedAt: completed ? Date.now() : undefined,
      totalReadMs: doc.detail.totalReadMs,
      furthestPos: Math.round(progress * 10000),
      currentPosition: doc.detail.position || {
        documentId: input.documentId,
        sectionId: 0,
        percentage: 0,
        parserVersion: 1,
      },
    });
  }

  /**
   * Reading Tracker: `tracker_get_map`
   */
  public async trackerGetMap(input: { documentId: string }): Promise<ReadingMap> {
    const doc = this.documents.get(input.documentId);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const { progress, completed } = TrackerOracle.computeProgress(doc.segments);

    const sections = doc.sections.map((sec) => {
      const secSegments = doc.segments.filter((s) => s.sectionIndex === sec.index);
      const readSecWords = secSegments.filter((s) => s.status === "read").reduce((a, s) => a + s.wordCount, 0);
      const totalSecWords = secSegments.reduce((a, s) => a + s.wordCount, 0) || 1;
      const secProgress = Math.min(1, readSecWords / totalSecWords);
      const status = secProgress >= 0.98 ? "read" : secProgress > 0 ? "reading" : "unread";

      return {
        sectionId: sec.id,
        index: sec.index,
        title: sec.title || `Section ${sec.index}`,
        progress: secProgress,
        status: status as "unread" | "reading" | "read",
        lastReadAt: undefined,
        readMs: 0,
        sessions: 0,
        segments: secSegments.map((s) => ({
          index: s.index,
          status: s.status,
          wordCount: s.wordCount,
        })),
        startPos: {
          documentId: input.documentId,
          sectionId: sec.index,
          blockId: sec.blocks[0]?.id,
          percentage: 0,
          parserVersion: 1,
        },
      };
    });

    return ReadingMapSchema.parse({
      documentId: input.documentId,
      progress,
      completed,
      totalReadMs: doc.detail.totalReadMs,
      sessions: doc.detail.sessionCount,
      lastReadAt: doc.detail.lastReadAt,
      sections,
      current: doc.detail.position || {
        documentId: input.documentId,
        sectionId: 0,
        percentage: 0,
        parserVersion: 1,
      },
    });
  }

  /**
   * Bookmark operations
   */
  public async bookmarkCreate(input: {
    documentId: string;
    position: LogicalPosition;
    title?: string;
    note?: string;
  }): Promise<Bookmark> {
    const doc = this.documents.get(input.documentId);
    if (!doc) {
      throw {
        code: "DocumentNotFound",
        message: "Document not found.",
        retryable: false,
      } as AppErrorDto;
    }

    const bookmark: Bookmark = {
      id: randomUUID(),
      documentId: input.documentId,
      position: input.position,
      title: input.title,
      note: input.note,
      createdAt: Date.now(),
    };

    const list = this.bookmarks.get(input.documentId) || [];
    list.push(bookmark);
    this.bookmarks.set(input.documentId, list);

    return BookmarkSchema.parse(bookmark);
  }

  /**
   * Settings operations
   */
  public async settingsGetAll(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.settings.entries());
  }

  public async settingsSet(input: { key: string; value: unknown }): Promise<void> {
    const allowedKeys = ["theme", "fontFamily", "fontSize", "lineHeight", "readingZoneHeight"];
    if (!allowedKeys.includes(input.key)) {
      throw {
        code: "InvalidInput",
        message: `Unknown setting key: ${input.key}`,
        retryable: false,
      } as AppErrorDto;
    }
    this.settings.set(input.key, input.value);
  }

  // --- Private Helpers ---

  private getMimeType(ext: FileType): string {
    switch (ext) {
      case "pdf": return "application/pdf";
      case "md": return "text/markdown";
      case "txt": return "text/plain";
      case "epub": return "application/epub+zip";
      case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "rtf": return "application/rtf";
    }
  }

  private parseDocumentAST(
    docId: string,
    fileType: FileType,
    content: string | Buffer
  ): {
    sections: SectionPayload[];
    toc: TocEntry[];
    segments: ReadingSegment[];
    wordCount: number;
    pageCount?: number;
  } {
    const textContent = typeof content === "string" ? content : content.toString("utf8");
    const sections: SectionPayload[] = [];
    const toc: TocEntry[] = [];
    const segments: ReadingSegment[] = [];

    if (fileType === "md") {
      const lines = textContent.split("\n");
      let currentSec: SectionPayload | null = null;
      let blockIdx = 0;
      let secIdx = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("#")) {
          const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
          if (match) {
            const level = match[1].length;
            const title = match[2];

            if (currentSec) {
              sections.push(currentSec);
            }

            blockIdx = 0;
            currentSec = {
              id: `sec-${secIdx}`,
              index: secIdx,
              title,
              level,
              wordCount: 0,
              blocks: [],
            };
            toc.push({
              title,
              sectionIndex: secIdx,
              blockId: `s${secIdx}-b0`,
            });
            secIdx += 1;
            continue;
          }
        }

        if (!currentSec) {
          currentSec = {
            id: `sec-0`,
            index: 0,
            title: "Introduction",
            level: 1,
            wordCount: 0,
            blocks: [],
          };
          secIdx = 1;
        }

        const words = trimmed.split(/\s+/).filter(Boolean).length;
        const blockId = `s${currentSec.index}-b${blockIdx++}`;
        currentSec.blocks.push({
          id: blockId,
          type: "paragraph",
          text: trimmed,
          wordCount: words,
        });
        currentSec.wordCount += words;
      }

      if (currentSec) {
        sections.push(currentSec);
      }
    } else if (fileType === "txt") {
      // Split into chapters or paragraphs
      const paragraphs = textContent.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      let secIdx = 0;

      for (const para of paragraphs) {
        const trimmed = para.trim();
        const words = trimmed.split(/\s+/).filter(Boolean).length;
        const isChapter = trimmed.toLowerCase().startsWith("chapter");
        const title = isChapter ? trimmed.split("\n")[0] : `Section ${secIdx + 1}`;

        const sec: SectionPayload = {
          id: `sec-${secIdx}`,
          index: secIdx,
          title,
          level: 1,
          wordCount: words,
          blocks: [
            {
              id: `s${secIdx}-b0`,
              type: "paragraph",
              text: trimmed,
              wordCount: words,
            },
          ],
        };
        sections.push(sec);
        toc.push({
          title,
          sectionIndex: secIdx,
          blockId: `s${secIdx}-b0`,
        });
        secIdx += 1;
      }
    } else {
      // Default / PDF fallback
      const sec: SectionPayload = {
        id: "sec-0",
        index: 0,
        title: "Page 1",
        level: 1,
        wordCount: 150,
        blocks: [
          {
            id: "s0-b0",
            type: "paragraph",
            text: "Document content",
            wordCount: 150,
          },
        ],
      };
      sections.push(sec);
      toc.push({ title: "Page 1", sectionIndex: 0 });
    }

    // Generate reading segments (target 40-220 words per segment per TRACKER_SPEC §2)
    let segIdx = 0;
    for (const sec of sections) {
      let accumulatedWords = 0;
      for (const blk of sec.blocks) {
        accumulatedWords += blk.wordCount;
        if (accumulatedWords >= 40 || accumulatedWords === sec.wordCount) {
          segments.push({
            index: segIdx++,
            sectionIndex: sec.index,
            wordCount: accumulatedWords,
            status: "unread",
            dwellMs: 0,
            readCount: 0,
          });
          accumulatedWords = 0;
        }
      }
      if (accumulatedWords > 0) {
        segments.push({
          index: segIdx++,
          sectionIndex: sec.index,
          wordCount: accumulatedWords,
          status: "unread",
          dwellMs: 0,
          readCount: 0,
        });
      }
    }

    const totalWordCount = sections.reduce((acc, s) => acc + s.wordCount, 0);
    return {
      sections,
      toc,
      segments,
      wordCount: totalWordCount,
      pageCount: fileType === "pdf" ? 1 : undefined,
    };
  }
}
