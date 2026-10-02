import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState component", () => {
  it("renders title, body, and hint", () => {
    render(
      <EmptyState
        title="Empty Library"
        body="No books found."
        hint="Import some books"
      />
    );

    expect(screen.getByText("Empty Library")).toBeInTheDocument();
    expect(screen.getByText("No books found.")).toBeInTheDocument();
    expect(screen.getByText("Import some books")).toBeInTheDocument();
  });

  it("handles primary action click", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="Empty Library"
        body="No books found."
        primaryAction={{
          label: "Import Now",
          onClick: handleAction,
        }}
      />
    );

    const button = screen.getByRole("button", { name: "Import Now" });
    fireEvent.click(button);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
