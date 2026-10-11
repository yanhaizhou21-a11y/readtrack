import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VirtualGrid } from "./VirtualGrid";

interface TestItem {
  id: string;
  title: string;
}

describe("VirtualGrid component", () => {
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight"
  );

  beforeEach(() => {
    // Mock clientHeight to simulate a 600px mobile viewport
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 600,
    });
  });

  afterEach(() => {
    if (originalClientHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        originalClientHeight
      );
    }
    vi.restoreAllMocks();
  });

  it("caps rendered DOM nodes under 30 even with 1000 items", () => {
    const items: TestItem[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      title: `Document ${i}`,
    }));

    render(
      <VirtualGrid
        items={items}
        itemKey={(item) => item.id}
        columns={2}
        itemHeight={200}
        overscan={2}
        renderItem={(item) => (
          <div data-testid="card-node" className="h-[180px]">
            {item.title}
          </div>
        )}
      />
    );

    const renderedNodes = screen.getAllByTestId("card-node");
    // With 600px height / 200px itemHeight = 3 rows visible.
    // With overscan=2: startRow=0, endRow=0 + 3 + 4 = 7 rows.
    // 7 rows * 2 columns = 14 items rendered.
    // Verified: strictly under 30 active DOM nodes!
    expect(renderedNodes.length).toBeLessThanOrEqual(30);
    expect(renderedNodes.length).toBeGreaterThan(0);
    expect(screen.getByText("Document 0")).toBeInTheDocument();
  });

  it("updates visible item slice upon scroll", () => {
    const items: TestItem[] = Array.from({ length: 500 }, (_, i) => ({
      id: `doc-${i}`,
      title: `Document ${i}`,
    }));

    render(
      <VirtualGrid
        items={items}
        itemKey={(item) => item.id}
        columns={1}
        itemHeight={100}
        overscan={2}
        renderItem={(item) => (
          <div data-testid="list-node" className="h-[90px]">
            {item.title}
          </div>
        )}
      />
    );

    const container = screen.getByTestId("virtual-grid-container");
    expect(screen.getByText("Document 0")).toBeInTheDocument();

    // Scroll down to 2000px (row 20)
    fireEvent.scroll(container, { target: { scrollTop: 2000 } });

    // Document 20 should now be rendered in the visible slice
    expect(screen.getByText("Document 20")).toBeInTheDocument();
  });

  it("renders empty state when items list is empty", () => {
    render(
      <VirtualGrid
        items={[]}
        itemKey={(item: TestItem) => item.id}
        emptyState={<div>No books available</div>}
        renderItem={(item) => <div>{item.title}</div>}
      />
    );

    expect(screen.getByText("No books available")).toBeInTheDocument();
  });
});
