export interface ReleaseInfo {
  version: string;
  title: string;
  changelog: string;
  downloadUrl?: string;
  releaseUrl: string;
  publishedAt?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestRelease: ReleaseInfo | null;
}
