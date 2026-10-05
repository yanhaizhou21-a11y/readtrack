import { createHash } from "node:crypto";

/**
 * Computes deterministic 64-character content hash for files/buffers.
 * Emulates BLAKE3 hash digest format (64-character hex string) in test harness.
 */
export function computeContentHash(content: string | Buffer | Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}
