import React from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";

export const ReadingMapScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Reading Map" showBack />
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title="No Progress Recorded"
          body={`No tracking data available yet for document: ${id ?? "unknown"}`}
        />
      </div>
    </div>
  );
};
