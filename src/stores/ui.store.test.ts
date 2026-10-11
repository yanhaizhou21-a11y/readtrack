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
      language: "en",
    });
  });

  it("updates theme correctly", () => {
    expect(useUiStore.getState().theme).toBe("system");
    useUiStore.getState().setTheme("dark");
    expect(useUiStore.getState().theme).toBe("dark");
  });

  it("updates language correctly", () => {
    expect(useUiStore.getState().language).toBe("en");
    useUiStore.getState().setLanguage("id");
    expect(useUiStore.getState().language).toBe("id");
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
