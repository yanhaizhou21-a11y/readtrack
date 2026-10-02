import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "./ui.store";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      theme: "system",
      readerChromeVisible: true,
      zoom: 1.0,
      activeModal: null,
      libraryFilter: "all",
      librarySort: "recent_opened",
      libraryView: "grid",
    });
  });

  it("updates theme correctly", () => {
    expect(useUiStore.getState().theme).toBe("system");
    useUiStore.getState().setTheme("dark");
    expect(useUiStore.getState().theme).toBe("dark");
  });

  it("toggles reader chrome visibility", () => {
    expect(useUiStore.getState().readerChromeVisible).toBe(true);
    useUiStore.getState().toggleReaderChrome();
    expect(useUiStore.getState().readerChromeVisible).toBe(false);
    useUiStore.getState().toggleReaderChrome();
    expect(useUiStore.getState().readerChromeVisible).toBe(true);
  });

  it("updates library filter and sort", () => {
    useUiStore.getState().setLibraryFilter("completed");
    expect(useUiStore.getState().libraryFilter).toBe("completed");

    useUiStore.getState().setLibrarySort("title");
    expect(useUiStore.getState().librarySort).toBe("title");
  });
});
