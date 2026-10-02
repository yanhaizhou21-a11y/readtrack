import React from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/feedback/EmptyState";

export const DocumentDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Document Details" showBack />
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          title="Document Not Found"
          body={`Unable to find document with ID: ${id ?? "unknown"}`}
          hint="Verify the document ID or return to library"
        />
      </div>
    </div>
  );
};
