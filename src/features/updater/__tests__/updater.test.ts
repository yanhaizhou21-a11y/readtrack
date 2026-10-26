import { describe, it, expect } from "vitest";
import { compareSemVer } from "../api";

describe("compareSemVer", () => {
  it("detects newer major versions", () => {
    expect(compareSemVer("v1.0.0", "0.1.0")).toBe(1);
    expect(compareSemVer("1.0.0", "0.9.9")).toBe(1);
  });

  it("detects newer minor versions", () => {
    expect(compareSemVer("v0.2.0", "0.1.0")).toBe(1);
    expect(compareSemVer("0.2.0", "0.1.9")).toBe(1);
  });

  it("detects newer patch versions", () => {
    expect(compareSemVer("v0.1.1", "0.1.0")).toBe(1);
    expect(compareSemVer("0.1.2", "0.1.0")).toBe(1);
  });

  it("identifies equal versions", () => {
    expect(compareSemVer("v0.1.0", "0.1.0")).toBe(0);
    expect(compareSemVer("0.1.0", "v0.1.0")).toBe(0);
  });

  it("identifies older versions", () => {
    expect(compareSemVer("v0.0.9", "0.1.0")).toBe(-1);
    expect(compareSemVer("0.0.1", "0.1.0")).toBe(-1);
  });
});
