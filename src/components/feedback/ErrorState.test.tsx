import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "./ErrorState";

describe("ErrorState component", () => {
  it("renders title, message, and error code", () => {
    render(
      <ErrorState
        code="DatabaseError"
        title="Failed to Load"
        message="Unable to communicate with SQLite."
      />
    );

    expect(screen.getByText("Failed to Load")).toBeInTheDocument();
    expect(screen.getByText("Unable to communicate with SQLite.")).toBeInTheDocument();
    expect(screen.getByText("Code: DatabaseError")).toBeInTheDocument();
  });

  it("triggers action button callback", () => {
    const handleRetry = vi.fn();
    render(
      <ErrorState
        message="Something went wrong."
        actions={[
          {
            label: "Retry Again",
            onClick: handleRetry,
          },
        ]}
      />
    );

    const button = screen.getByRole("button", { name: "Retry Again" });
    fireEvent.click(button);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
