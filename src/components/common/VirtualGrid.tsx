import React, { useState, useEffect, useRef, useCallback } from "react";

export interface VirtualGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemKey: (item: T, index: number) => string | number;
  columns?: number;
  itemHeight?: number;
  overscan?: number;
  className?: string;
  gridClassName?: string;
  emptyState?: React.ReactNode;
}

export function VirtualGrid<T>({
  items,
  renderItem,
  itemKey,
  columns = 1,
  itemHeight = 240,
  overscan = 2,
  className = "",
  gridClassName = "",
  emptyState,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const clientHeight = containerRef.current.clientHeight;
      if (clientHeight > 0) {
        setViewportHeight(clientHeight);
      }
    }
  }, []);

  useEffect(() => {
    updateDimensions();

    const handleResize = () => {
      updateDimensions();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateDimensions]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  if (items.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  const safeColumns = Math.max(1, columns);
  const totalRows = Math.ceil(items.length / safeColumns);
  const totalHeight = totalRows * itemHeight;

  // Calculate visible row slice
  const startRow = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleRowCount = Math.ceil(viewportHeight / itemHeight);
  const endRow = Math.min(totalRows - 1, startRow + visibleRowCount + overscan * 2);

  const startIndex = startRow * safeColumns;
  const endIndex = Math.min(items.length, (endRow + 1) * safeColumns);
  const visibleItems = items.slice(startIndex, endIndex);
  const topOffset = startRow * itemHeight;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto ${className}`}
      data-testid="virtual-grid-container"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        style={{
          height: `${totalHeight}px`,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          data-testid="virtual-grid-content"
          className={gridClassName}
          style={{
            position: "absolute",
            top: `${topOffset}px`,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, localIdx) => {
            const actualIndex = startIndex + localIdx;
            return (
              <React.Fragment key={itemKey(item, actualIndex)}>
                {renderItem(item, actualIndex)}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
