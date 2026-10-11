import { describe, it, expect } from "vitest";
import { parseImportSource } from "./deepLink";

describe("parseImportSource", () => {
  it("returns null for empty or non-string inputs", () => {
    expect(parseImportSource("")).toBeNull();
    expect(parseImportSource("   ")).toBeNull();
    expect(parseImportSource(null as unknown as string)).toBeNull();
    expect(parseImportSource(undefined as unknown as string)).toBeNull();
  });

  it("parses custom scheme query parameters (rt:// and readtrack://)", () => {
    expect(
      parseImportSource("rt://import?source=%2Fstorage%2Femulated%2F0%2Fbook.epub")
    ).toBe("/storage/emulated/0/book.epub");

    expect(
      parseImportSource("readtrack://import?importSource=/sdcard/books/paper.pdf")
    ).toBe("/sdcard/books/paper.pdf");

    expect(
      parseImportSource("rt://import?source=C%3A%5CUsers%5Cdoc.txt")
    ).toBe("C:\\Users\\doc.txt");
  });

  it("parses custom scheme path format", () => {
    expect(
      parseImportSource("rt://import/%2Fstorage%2Fbooks%2Fmanual.pdf")
    ).toBe("/storage/books/manual.pdf");

    expect(
      parseImportSource("rt://import/C:/Users/books/manual.pdf")
    ).toBe("C:/Users/books/manual.pdf");
  });

  it("returns null for unsupported custom scheme routes", () => {
    expect(parseImportSource("rt://settings")).toBeNull();
    expect(parseImportSource("rt://import")).toBeNull();
  });

  it("parses file:// URIs correctly across Unix and Windows formats", () => {
    expect(parseImportSource("file:///storage/emulated/0/book.epub")).toBe(
      "/storage/emulated/0/book.epub"
    );
    expect(parseImportSource("file:///C:/Users/Reader/guide.pdf")).toBe(
      "C:/Users/Reader/guide.pdf"
    );
    expect(parseImportSource("file://localhost/sdcard/document.pdf")).toBe(
      "/sdcard/document.pdf"
    );
  });

  it("parses search query strings", () => {
    expect(parseImportSource("?importSource=%2Fdata%2Fdoc.pdf")).toBe(
      "/data/doc.pdf"
    );
    expect(parseImportSource("?source=/data/doc.epub")).toBe("/data/doc.epub");
  });

  it("passes through standard filesystem paths unchanged", () => {
    expect(parseImportSource("/storage/emulated/0/Download/test.epub")).toBe(
      "/storage/emulated/0/Download/test.epub"
    );
    expect(parseImportSource("C:\\Documents\\novel.txt")).toBe(
      "C:\\Documents\\novel.txt"
    );
  });
});
