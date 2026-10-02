import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useUiStore } from "@/stores/ui.store";

export const ReaderScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { readerChromeVisible, toggleReaderChrome } = useUiStore();

  return (
    <div
      className="fixed inset-0 bg-background text-foreground flex flex-col z-50 select-none"
      onClick={toggleReaderChrome}
    >
      {/* Top chrome bar */}
      <div
        className={`sticky top-0 z-10 bg-background/95 backdrop-blur-md pt-safe border-b border-border/50 transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-14 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-10 h-10 rounded-control flex items-center justify-center hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-serif text-sm font-medium truncate max-w-[200px]">
            Document Reader
          </span>
          <span className="font-mono text-xs text-muted">0%</span>
        </div>
      </div>

      {/* Reader body area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="font-serif text-lg text-foreground mb-2">
          Reader Shell
        </p>
        <p className="font-mono text-xs text-muted">
          Doc ID: {id}
        </p>
        <p className="text-xs text-muted mt-4">
          Tap screen to toggle toolbar chrome
        </p>
      </div>

      {/* Bottom chrome bar */}
      <div
        className={`sticky bottom-0 z-10 bg-surface/95 backdrop-blur-md pb-safe border-t border-border/50 transition-transform duration-200 ${
          readerChromeVisible ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-around h-12 max-w-md mx-auto text-xs text-muted px-4">
          <span>TOC</span>
          <span>Appearance</span>
          <span>Bookmarks</span>
        </div>
      </div>
    </div>
  );
};
