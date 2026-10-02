import { ipc } from "@/lib/ipc";
import { z } from "zod";
import type { AppSettings, SettingsKey } from "@/types";

const SettingsRecordSchema = z.record(z.unknown());

export async function settingsGetAll(): Promise<AppSettings> {
  const result = await ipc<Record<string, unknown>>(
    "settings_get_all",
    {},
    SettingsRecordSchema
  );
  return result as unknown as AppSettings;
}

export async function settingsSet(key: SettingsKey, value: unknown): Promise<void> {
  await ipc<void>("settings_set", { key, value });
}
