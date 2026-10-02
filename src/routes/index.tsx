import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { HomeScreen } from "@/features/home/HomeScreen";
import { LibraryScreen } from "@/features/library/LibraryScreen";
import { DocumentDetailScreen } from "@/features/library/DocumentDetailScreen";
import { ReaderScreen } from "@/features/reader/ReaderScreen";
import { TrackerScreen } from "@/features/tracker/TrackerScreen";
import { ReadingMapScreen } from "@/features/tracker/ReadingMapScreen";
import { SearchScreen } from "@/features/search/SearchScreen";
import { AnnotationsScreen } from "@/features/annotations/AnnotationsScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: "library", element: <LibraryScreen /> },
      { path: "library/:id", element: <DocumentDetailScreen /> },
      { path: "read/:id", element: <ReaderScreen /> },
      { path: "tracker", element: <TrackerScreen /> },
      { path: "tracker/:id", element: <ReadingMapScreen /> },
      { path: "search", element: <SearchScreen /> },
      { path: "annotations", element: <AnnotationsScreen /> },
      { path: "settings", element: <SettingsScreen /> },
    ],
  },
]);
