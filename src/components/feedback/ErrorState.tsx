import React from "react";
import type { AppErrorCode } from "@/types";

export interface ErrorAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface ErrorStateProps {
  code?: AppErrorCode | string;
  message: string;
  title?: string;
  actions?: ErrorAction[];
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  code,
  message,
  title = "Something went wrong",
  actions = [],
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto min-h-[260px] ${className}`}
      data-testid="error-state"
    >
      <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 stroke-current stroke-[2] fill-none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-1">
        {title}
      </h3>

      <p className="text-sm text-muted mb-6 leading-relaxed">
        {message}
      </p>

      {actions.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          {actions.map((act, idx) => {
            const isPrimary = act.variant !== "secondary";
            return (
              <button
                key={idx}
                type="button"
                onClick={act.onClick}
                className={`w-full sm:w-auto flex-1 h-11 px-5 rounded-control text-sm font-medium transition-opacity ${
                  isPrimary
                    ? "bg-accent text-accent-foreground hover:opacity-95"
                    : "border border-border text-foreground hover:bg-surface-2"
                }`}
              >
                {act.label}
              </button>
            );
          })}
        </div>
      )}

      {code && (
        <span className="mt-4 font-mono text-[11px] text-muted/80">
          Code: {code}
        </span>
      )}
    </div>
  );
};
