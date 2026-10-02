import React from "react";

export interface LoadingSkeletonProps {
  className?: string;
  count?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  className = "h-4 w-full",
  count = 1,
}) => {
  return (
    <div className="space-y-3 w-full" data-testid="loading-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-surface-2 rounded-control ${className}`}
        />
      ))}
    </div>
  );
};
