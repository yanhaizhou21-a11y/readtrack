import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { ipc, IpcException, parseIpcError } from "./ipc";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("IPC client wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully invokes command and validates result schema", async () => {
    const mockData = { key: "value", count: 42 };
    vi.mocked(invoke).mockResolvedValueOnce(mockData);

    const schema = z.object({
      key: z.string(),
      count: z.number(),
    });

    const result = await ipc("test_command", {}, schema);
    expect(result).toEqual(mockData);
    expect(invoke).toHaveBeenCalledWith("test_command", {});
  });

  it("throws IpcException when response fails schema validation", async () => {
    const mockData = { key: "value", count: "not-a-number" };
    vi.mocked(invoke).mockResolvedValueOnce(mockData);

    const schema = z.object({
      key: z.string(),
      count: z.number(),
    });

    await expect(ipc("test_command", {}, schema)).rejects.toThrow(IpcException);
    await expect(ipc("test_command", {}, schema)).rejects.toMatchObject({
      code: "InvalidInput",
    });
  });

  it("maps structured backend error to IpcException", async () => {
    const backendError = {
      code: "DocumentNotFound",
      message: "The requested document was not found.",
      retryable: false,
    };
    vi.mocked(invoke).mockRejectedValueOnce(backendError);

    await expect(ipc("document_get", { id: "123" })).rejects.toMatchObject({
      code: "DocumentNotFound",
      message: "The requested document was not found.",
      retryable: false,
    });
  });

  it("handles parseIpcError fallback for unexpected strings", () => {
    const err = parseIpcError("Some panic or network drop");
    expect(err.code).toBe("Internal");
    expect(err.message).toBe("Some panic or network drop");
    expect(err.retryable).toBe(false);
  });
});
