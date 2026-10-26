import { z } from "zod";

/**
 * Universal optional helper for IPC contracts.
 * Accepts `T`, `null`, or `undefined` (omitted), and transforms `null` to `undefined`.
 * Guarantees UI components only ever see `T | undefined`, never `null`.
 */
export const opt = <T extends z.ZodTypeAny>(s: T) =>
  s.nullish().transform((v) => (v ?? undefined) as z.infer<T> | undefined);
