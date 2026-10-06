import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { settingsGetAll, settingsSet } from "./api";
import { useUiStore, type AppTheme } from "@/stores/ui.store";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import type { AppSettings } from "@/types";

function applyThemeClass(newTheme: AppTheme) {
  const root = document.documentElement;
  if (newTheme === "dark") {
    root.classList.add("dark");
  } else if (newTheme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const { theme, setTheme } = useUiStore();

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await settingsGetAll();
        if (!cancelled) {
          setSettings(data);
          if (data.theme) {
            setTheme(data.theme);
            applyThemeClass(data.theme);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Failed to load settings:", err);
          setError(err instanceof Error ? err.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [setTheme, reloadTrigger]);

  const handleThemeChange = async (newTheme: AppTheme) => {
    try {
      setTheme(newTheme);
      applyThemeClass(newTheme);
      await settingsSet("theme", newTheme);
      setSettings((prev) => (prev ? { ...prev, theme: newTheme } : null));
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  };

  const handleLanguageChange = async (lang: "en" | "id") => {
    try {
      await settingsSet("language", lang);
      setSettings((prev) => (prev ? { ...prev, language: lang } : null));
    } catch (err) {
      console.error("Failed to save language:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Settings" />
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
        {loading ? (
          <div className="p-4 space-y-4">
            <LoadingSkeleton count={4} className="h-12 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title="Unable to load settings"
            message={error}
            actions={[
              {
                label: "Retry",
                onClick: () => setReloadTrigger((prev) => prev + 1),
              },
            ]}
          />
        ) : (
          <>
            {/* Appearance Section */}
            <section className="bg-surface rounded-card p-4 border border-border">
              <h2 className="text-xs font-semibold uppercase text-muted tracking-wider mb-3">
                Appearance
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    App Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["system", "light", "dark"] as AppTheme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleThemeChange(t)}
                        className={`h-10 rounded-control text-xs font-medium capitalize border transition-all ${
                          theme === t
                            ? "bg-accent text-accent-foreground border-accent"
                            : "border-border text-foreground hover:bg-surface-2"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Language
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("en")}
                      className={`h-10 rounded-control text-xs font-medium border transition-all ${
                        settings?.language === "en"
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-foreground hover:bg-surface-2"
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("id")}
                      className={`h-10 rounded-control text-xs font-medium border transition-all ${
                        settings?.language === "id"
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-foreground hover:bg-surface-2"
                      }`}
                    >
                      Bahasa Indonesia
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Export & Dossiers Section */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">
                    Data & Export
                  </h2>
                  <p className="font-serif text-xs text-foreground mt-0.5">
                    Generate offline Excel ledgers or print PDF reports.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/export")}
                className="w-full py-2.5 px-3 border border-border bg-surface-2 text-foreground font-mono text-xs font-bold uppercase tracking-wide hover:bg-surface-3 transition-colors flex items-center justify-between"
              >
                <span>Export Reading Dossier (.xlsx / .pdf)</span>
                <span className="text-accent text-[11px] font-sans">Open &rarr;</span>
              </button>
            </section>

            {/* Storage & Privacy Section */}
            <section className="bg-surface rounded-card p-4 border border-border">
              <h2 className="text-xs font-semibold uppercase text-muted tracking-wider mb-3">
                Storage & Privacy
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                ReadTrack is 100% offline and local-first. Your documents and reading
                activity never leave this device.
              </p>
            </section>

            {/* About Section */}
            <section className="bg-surface rounded-card p-4 border border-border text-center">
              <h2 className="font-serif font-semibold text-foreground text-sm">
                ReadTrack v0.1.0
              </h2>
              <p className="font-mono text-[11px] text-muted mt-1">
                Phase 1 — Foundation Shell
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
