import { create } from "zustand";

export type AppTheme = "system" | "light" | "dark";
export type LibraryFilter = "all" | "in_progress" | "completed" | "archived";
export type LibrarySort = "recent_opened" | "recent_added" | "title" | "progress";
export type LibraryView = "grid" | "list";

export interface UiState {
  theme: AppTheme;
  readerChromeVisible: boolean;
  zoom: number;
  activeModal: string | null;
  libraryFilter: LibraryFilter;
  librarySort: LibrarySort;
  libraryView: LibraryView;

  setTheme: (theme: AppTheme) => void;
  setReaderChromeVisible: (visible: boolean) => void;
  toggleReaderChrome: () => void;
  setZoom: (zoom: number) => void;
  setActiveModal: (modal: string | null) => void;
  setLibraryFilter: (filter: LibraryFilter) => void;
  setLibrarySort: (sort: LibrarySort) => void;
  setLibraryView: (view: LibraryView) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  readerChromeVisible: true,
  zoom: 1.0,
  activeModal: null,
  libraryFilter: "all",
  librarySort: "recent_opened",
  libraryView: "grid",

  setTheme: (theme) => set({ theme }),
  setReaderChromeVisible: (readerChromeVisible) => set({ readerChromeVisible }),
  toggleReaderChrome: () =>
    set((state) => ({ readerChromeVisible: !state.readerChromeVisible })),
  setZoom: (zoom) => set({ zoom }),
  setActiveModal: (activeModal) => set({ activeModal }),
  setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
  setLibrarySort: (librarySort) => set({ librarySort }),
  setLibraryView: (libraryView) => set({ libraryView }),
}));
