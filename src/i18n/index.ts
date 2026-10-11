import { useCallback } from "react";
import { useUiStore, type AppLanguage } from "@/stores/ui.store";
import { en, type TranslationKey } from "./en";
import { id } from "./id";
import type { TranslationParams } from "./types";

export type { AppLanguage, TranslationKey, TranslationParams };

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = {
  en,
  id,
};

/**
 * Translates a given key with optional string interpolation parameters.
 * Falls back to English if the key is missing in the target language.
 */
export function translate(
  key: TranslationKey,
  params?: TranslationParams,
  lang: AppLanguage = "en"
): string {
  const dict = dictionaries[lang] || dictionaries.en;
  let text = dict[key] || dictionaries.en[key] || (key as string);

  if (params) {
    Object.entries(params).forEach(([paramKey, val]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(val));
    });
  }

  return text;
}

/**
 * React hook for lightweight, zero-dependency translation.
 * Reactively subscribes to `language` in `useUiStore`.
 */
export function useTranslation() {
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      return translate(key, params, language);
    },
    [language]
  );

  return { t, language, setLanguage };
}
