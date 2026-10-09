import React, { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";
import { useUiStore } from "@/stores/ui.store";
import { listen } from "@tauri-apps/api/event";
import { onAction, type ActionNotification } from "@/lib/notification";
import type { NotificationPayload } from "@/types";

export const App: React.FC = () => {
  const { theme } = useUiStore();

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

  useEffect(() => {
    let unlistenEvent: (() => void) | undefined;
    let unlistenAction: (() => void) | undefined;

    listen<NotificationPayload>("reminder_notification_triggered", (event) => {
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
    };
  }, []);

  return <RouterProvider router={router} />;
};
