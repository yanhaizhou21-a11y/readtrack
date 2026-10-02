export interface AppSettings {
  theme: "system" | "light" | "dark";
  "reader.theme": "light" | "sepia" | "dark";
  "reader.font_family": "serif" | "sans";
  "reader.font_scale": number;
  "reader.line_height": number;
  "reader.margin": "compact" | "normal" | "wide";
  language: "en" | "id";
  "tracker.min_dwell_ms": number;
  "tracker.max_wpm": number;
  "tracker.read_ratio": number;
  "tracker.idle_timeout_ms": number;
  "library.view": "grid" | "list";
  "library.sort": "recent_opened" | "recent_added" | "title" | "progress";
  "onboarding.done": boolean;
  [key: string]: unknown;
}

export type SettingsKey = keyof AppSettings;
