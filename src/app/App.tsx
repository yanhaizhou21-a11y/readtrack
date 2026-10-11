import React, { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";
import { useUiStore } from "@/stores/ui.store";
import { safeListen } from "@/lib/ipc";
import { onAction, type ActionNotification } from "@/lib/notification";
import { settingsGetAll } from "@/features/settings/api";
import { parseImportSource } from "@/lib/deepLink";
import type { NotificationPayload } from "@/types";

export const App: React.FC = () => {
  const { theme, setLanguage } = useUiStore();

  useEffect(() => {
    // Synchronize saved user language from database on launch
    settingsGetAll()
      .then((settings) => {
        if (settings.language === "en" || settings.language === "id") {
          setLanguage(settings.language);
        }
      })
      .catch(() => {});
  }, [setLanguage]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, [theme]);

  // Deep-link & open-with external file handler
  useEffect(() => {
    let unlistenEvent: (() => void) | undefined;
    let unlistenAction: (() => void) | undefined;
    let unlistenOpenFile: (() => void) | undefined;
    let unlistenDeepLink: (() => void) | undefined;

    // Check startup query parameters or rt:// custom scheme URL
    const startupCandidate =
      window.location.search ||
      (window.location.href.startsWith("rt://") || window.location.href.startsWith("readtrack://")
        ? window.location.href
        : null);
    const initialSource = parseImportSource(startupCandidate);
    if (initialSource) {
      router.navigate(`/library?importSource=${encodeURIComponent(initialSource)}`);
    }

    // Tauri external file open event (e.g. Android intent / file association)
    safeListen<string | { path?: string; source?: string }>("open-file", (event) => {
      const raw =
        typeof event.payload === "string"
          ? event.payload
          : event.payload?.path || event.payload?.source;
      const parsed = parseImportSource(raw);
      if (parsed) {
        router.navigate(`/library?importSource=${encodeURIComponent(parsed)}`);
      }
    })
      .then((unlisten) => {
        unlistenOpenFile = unlisten;
      })
      .catch(() => {});

    // Tauri deep-link event (e.g. rt://import?source=...)
    safeListen<string | { url?: string }>("deep-link", (event) => {
      const rawUrl = typeof event.payload === "string" ? event.payload : event.payload?.url;
      const parsed = parseImportSource(rawUrl);
      if (parsed) {
        router.navigate(`/library?importSource=${encodeURIComponent(parsed)}`);
      }
    })
      .then((unlisten) => {
        unlistenDeepLink = unlisten;
      })
      .catch(() => {});

    safeListen<NotificationPayload>("reminder_notification_triggered", (event) => {
      if (event.payload?.documentId) {
        router.navigate(`/read/${event.payload.documentId}`);
      }
    })
      .then((unlisten) => {
        unlistenEvent = unlisten;
      })
      .catch(() => {});

    onAction((notification: ActionNotification) => {
      const docId = notification.extra?.documentId as string | undefined;
      if (docId) {
        router.navigate(`/read/${docId}`);
      }
    })
      .then((unlisten: () => void) => {
        unlistenAction = unlisten;
      })
      .catch(() => {});

    return () => {
      unlistenEvent?.();
      unlistenAction?.();
      unlistenOpenFile?.();
      unlistenDeepLink?.();
    };
  }, []);

  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
};
