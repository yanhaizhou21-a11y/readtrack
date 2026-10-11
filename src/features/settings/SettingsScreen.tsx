import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { settingsGetAll, settingsSet } from "./api";
import { reminderList } from "./reminderApi";
import { useUiStore, type AppTheme } from "@/stores/ui.store";
import { useTranslation } from "@/i18n";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import type { AppSettings, Reminder } from "@/types";

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
  const { t, setLanguage } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
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
        const [data, reminderData] = await Promise.all([
          settingsGetAll(),
          reminderList().catch(() => []),
        ]);
        if (!cancelled) {
          setSettings(data);
          setReminders(reminderData);
          if (data.theme) {
            setTheme(data.theme);
            applyThemeClass(data.theme);
          }
          if (data.language) {
            setLanguage(data.language);
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
  }, [setTheme, setLanguage, reloadTrigger]);

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
      setLanguage(lang);
      await settingsSet("language", lang);
      setSettings((prev) => (prev ? { ...prev, language: lang } : null));
    } catch (err) {
      console.error("Failed to save language:", err);
    }
  };

  const habit = reminders.find((r) => r.documentId === null);
  let reminderSummary = t("settings.noActiveHabit");
  if (habit) {
    if (habit.enabled) {
      const h = Math.floor((habit.timeOfDayMin ?? 1200) / 60);
      const m = (habit.timeOfDayMin ?? 1200) % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      const typeStr =
        habit.scheduleType.charAt(0).toUpperCase() + habit.scheduleType.slice(1);
      reminderSummary = `${typeStr} at ${timeStr} · Active`;
    } else {
      reminderSummary = t("settings.notificationsPaused");
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header title={t("settings.title")} />
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
        {loading ? (
          <div className="p-4 space-y-4">
            <LoadingSkeleton count={4} className="h-12 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title={t("settings.unableToLoad")}
            message={error}
            actions={[
              {
                label: t("settings.retry"),
                onClick: () => setReloadTrigger((prev) => prev + 1),
              },
            ]}
          />
        ) : (
          <>
            {/* Appearance Section */}
            <section className="bg-surface rounded-card p-4 border border-border">
              <h2 className="text-xs font-semibold uppercase text-muted tracking-wider mb-3">
                {t("settings.appearance")}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    {t("settings.appTheme")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["system", "light", "dark"] as AppTheme[]).map((tVal) => (
                      <button
                        key={tVal}
                        type="button"
                        onClick={() => handleThemeChange(tVal)}
                        className={`h-10 rounded-control text-xs font-medium capitalize border transition-all ${
                          theme === tVal
                            ? "bg-accent text-accent-foreground border-accent"
                            : "border-border text-foreground hover:bg-surface-2"
                        }`}
                      >
                        {tVal}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <label className="text-sm font-medium text-foreground block mb-2">
                    {t("settings.language")}
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
                      {t("settings.english")}
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
                      {t("settings.indonesian")}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Reading Reminders Section */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold uppercase text-muted tracking-wider flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-accent" />
                    <span>{t("settings.reminders")}</span>
                  </h2>
                  <p className="font-serif text-xs text-foreground mt-0.5">
                    {reminderSummary}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/settings/reminders")}
                className="w-full min-h-[44px] py-2.5 px-3 border border-border bg-surface-2 text-foreground font-mono text-xs font-bold uppercase tracking-wide hover:bg-surface-3 transition-colors flex items-center justify-between"
              >
                <span>{t("settings.configureHabits")}</span>
                <span className="text-accent text-[11px] font-sans">Open &rarr;</span>
              </button>
            </section>

            {/* Export & Dossiers Section */}
            <section className="bg-surface rounded-card p-4 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">
                    {t("settings.dataExport")}
                  </h2>
                  <p className="font-serif text-xs text-foreground mt-0.5">
                    {t("settings.dataExportDesc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/export")}
                className="w-full py-2.5 px-3 border border-border bg-surface-2 text-foreground font-mono text-xs font-bold uppercase tracking-wide hover:bg-surface-3 transition-colors flex items-center justify-between"
              >
                <span>{t("settings.exportBtn")}</span>
                <span className="text-accent text-[11px] font-sans">Open &rarr;</span>
              </button>
            </section>

            {/* Storage & Privacy Section */}
            <section className="bg-surface rounded-card p-4 border border-border">
              <h2 className="text-xs font-semibold uppercase text-muted tracking-wider mb-3">
                {t("settings.storagePrivacy")}
              </h2>
              <p className="text-xs text-muted leading-relaxed">
                {t("settings.storagePrivacyBody")}
              </p>
            </section>

            {/* About Section */}
            <section className="bg-surface rounded-card p-4 border border-border text-center">
              <h2 className="font-serif font-semibold text-foreground text-sm">
                ReadTrack v0.1.0
              </h2>
              <p className="font-mono text-[11px] text-muted mt-1">
                Phase 8: Polish and Release Readiness
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
