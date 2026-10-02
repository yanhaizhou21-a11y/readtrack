import React from "react";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  body: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  hint?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  illustration,
  title,
  body,
  primaryAction,
  secondaryAction,
  hint,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto min-h-[300px] ${className}`}
      data-testid="empty-state"
    >
      <div className="mb-4 text-muted flex items-center justify-center">
        {illustration ?? (
          <svg
            className="w-16 h-16 stroke-muted stroke-[1.5] fill-none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        )}
      </div>

      <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
        {title}
      </h3>

      <p className="text-sm text-muted mb-6 leading-relaxed">
        {body}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="w-full sm:w-auto flex-1 h-11 px-6 rounded-control bg-accent text-accent-foreground font-medium text-sm transition-opacity hover:opacity-95 active:opacity-90 flex items-center justify-center"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="w-full sm:w-auto h-11 px-4 rounded-control text-muted hover:text-foreground text-sm font-medium transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      {hint && (
        <span className="mt-4 font-mono text-xs text-muted">
          {hint}
        </span>
      )}
    </div>
  );
};
