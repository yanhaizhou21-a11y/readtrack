import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTranslation, translate } from "./index";
import { useUiStore } from "@/stores/ui.store";

describe("i18n engine", () => {
  beforeEach(() => {
    useUiStore.setState({ language: "en" });
  });

  it("translates english keys accurately by default", () => {
    expect(translate("nav.home", undefined, "en")).toBe("Home");
    expect(translate("library.title", undefined, "en")).toBe("Library");
    expect(translate("home.welcomeTitle", undefined, "en")).toBe("Welcome to ReadTrack");
  });

  it("translates indonesian keys accurately when language is id", () => {
    expect(translate("nav.home", undefined, "id")).toBe("Beranda");
    expect(translate("library.title", undefined, "id")).toBe("Pustaka");
    expect(translate("home.welcomeTitle", undefined, "id")).toBe("Selamat datang di ReadTrack");
  });

  it("interpolates parameters in translation strings", () => {
    expect(translate("home.chapter", { title: "Introduction" }, "en")).toBe(
      "Chapter: Introduction"
    );
    expect(translate("home.chapter", { title: "Pengantar" }, "id")).toBe(
      "Bab: Pengantar"
    );
    expect(translate("export.entireLibrary", { count: 42 }, "en")).toBe(
      "Entire Library (42 Publications)"
    );
    expect(translate("export.entireLibrary", { count: 42 }, "id")).toBe(
      "Seluruh Pustaka (42 Dokumen)"
    );
  });

  it("useTranslation hook reacts to language store state changes", () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe("en");
    expect(result.current.t("nav.home")).toBe("Home");

    act(() => {
      result.current.setLanguage("id");
    });

    expect(result.current.language).toBe("id");
    expect(result.current.t("nav.home")).toBe("Beranda");
    expect(result.current.t("library.title")).toBe("Pustaka");
  });

  it("falls back to english if a key is not present in another dictionary", () => {
    // @ts-expect-error test fallback with unknown key
    expect(translate("nonexistent_key", undefined, "id")).toBe("nonexistent_key");
  });

  it("ensures en and id dictionaries have 100% key parity with no missing translations", async () => {
    const { en } = await import("./en");
    const { id } = await import("./id");

    const enKeys = Object.keys(en).sort();
    const idKeys = Object.keys(id).sort();

    expect(idKeys).toEqual(enKeys);
  });
});
