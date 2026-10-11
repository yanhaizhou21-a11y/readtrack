/**
 * Safely parse an import target path or URI from deep links or external open-with intents.
 * Supports custom schemes (rt://, readtrack://), file URIs (file://), search query parameters,
 * and direct filesystem paths without throwing.
 */
export function parseImportSource(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Handle rt:// or readtrack:// custom schemes
  if (/^(?:rt|readtrack):\/\//i.test(trimmed)) {
    try {
      // 1. Query param syntax: rt://import?source=... or rt://import?importSource=...
      const queryIdx = trimmed.indexOf("?");
      if (queryIdx !== -1) {
        const query = trimmed.slice(queryIdx);
        const params = new URLSearchParams(query);
        const src = params.get("source") || params.get("importSource");
        if (src) {
          return decodeURIComponent(src);
        }
      }

      // 2. Path syntax: rt://import/<path>
      const match = trimmed.match(/^(?:rt|readtrack):\/\/(?:import\/?)(.*)$/i);
      if (match && match[1]) {
        const cleaned = decodeURIComponent(match[1].trim());
        if (cleaned) {
          // If Windows path like /C:/Users...
          if (/^\/[a-zA-Z]:/.test(cleaned)) {
            return cleaned.slice(1);
          }
          return cleaned;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // Handle URL query string: ?importSource=... or ?source=...
  if (trimmed.startsWith("?")) {
    try {
      const params = new URLSearchParams(trimmed);
      const src = params.get("importSource") || params.get("source");
      if (src) {
        return decodeURIComponent(src);
      }
    } catch {
      return null;
    }
  }

  // Handle file:// URIs
  if (trimmed.startsWith("file://")) {
    try {
      let pathPart = trimmed.replace(/^file:\/\//, "");
      // Remove localhost if present: file://localhost/path
      if (pathPart.startsWith("localhost/")) {
        pathPart = pathPart.slice("localhost".length);
      }
      const decoded = decodeURIComponent(pathPart);
      // Windows file:///C:/path -> decoded is /C:/path
      if (/^\/[a-zA-Z]:/.test(decoded)) {
        return decoded.slice(1);
      }
      return decoded;
    } catch {
      return trimmed.replace(/^file:\/\//, "");
    }
  }

  // Standard absolute or relative filesystem paths
  return trimmed;
}
