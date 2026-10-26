import { ReleaseInfo, UpdateCheckResult } from "./types";
import { openUrl } from "@tauri-apps/plugin-opener";

export const CURRENT_APP_VERSION = "0.1.0";
export const GITHUB_REPO = "yanhaizhou21-a11y/readtrack";

export function compareSemVer(v1: string, v2: string): number {
  const parse = (s: string) =>
    s
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const p1 = parse(v1);
  const p2 = parse(v2);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export async function checkForUpdates(
  repo: string = GITHUB_REPO
): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestRelease: null,
      };
    }

    const data = await response.json();
    const tagName: string = data.tag_name || "";
    const releaseUrl: string = data.html_url || `https://github.com/${repo}/releases`;
    const title: string = data.name || tagName;
    const changelog: string = data.body || "Pembaruan performa dan perbaikan bug.";

    // Find APK asset if available
    let downloadUrl = releaseUrl;
    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find(
        (a: { name?: string; browser_download_url?: string }) =>
          a.name?.endsWith(".apk")
      );
      if (apkAsset?.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url;
      }
    }

    const hasUpdate = compareSemVer(tagName, CURRENT_APP_VERSION) > 0;

    const releaseInfo: ReleaseInfo = {
      version: tagName,
      title,
      changelog,
      downloadUrl,
      releaseUrl,
      publishedAt: data.published_at,
    };

    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease: releaseInfo,
    };
  } catch {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease: null,
    };
  }
}

export async function openUpdateDownload(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank");
  }
}
