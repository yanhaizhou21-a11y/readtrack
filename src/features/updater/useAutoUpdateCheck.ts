import { useEffect, useState } from "react";
import { checkForUpdates } from "./api";
import { ReleaseInfo } from "./types";

export function useAutoUpdateCheck() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("0.1.0");
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function check() {
      // Check if already dismissed in this session
      const dismissed = sessionStorage.getItem("readtrack_update_dismissed");
      try {
        const result = await checkForUpdates();
        if (!isMounted) return;

        setCurrentVersion(result.currentVersion);
        if (result.hasUpdate && result.latestRelease) {
          setRelease(result.latestRelease);
          if (dismissed !== result.latestRelease.version) {
            setIsOpen(true);
          }
        }
      } catch {
        // silent catch on auto check
      }
    }

    check();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleClose = () => {
    if (release) {
      sessionStorage.setItem("readtrack_update_dismissed", release.version);
    }
    setIsOpen(false);
  };

  const manualCheck = async (): Promise<{
    hasUpdate: boolean;
    version?: string;
  }> => {
    setChecking(true);
    try {
      const result = await checkForUpdates();
      setCurrentVersion(result.currentVersion);
      if (result.hasUpdate && result.latestRelease) {
        setRelease(result.latestRelease);
        setIsOpen(true);
        return { hasUpdate: true, version: result.latestRelease.version };
      }
      return { hasUpdate: false };
    } finally {
      setChecking(false);
    }
  };

  return {
    release,
    currentVersion,
    isOpen,
    checking,
    manualCheck,
    closeModal: handleClose,
  };
}
