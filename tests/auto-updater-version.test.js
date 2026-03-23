import { describe, it, expect } from "vitest";
import updater from "../desktop/auto-updater.cjs";

const { compareVersions, isNewerVersion } = updater.__testUtils;

describe("auto updater version compare", () => {
  it("compares stable versions correctly", () => {
    expect(compareVersions("1.2.3", "1.2.2")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.2", "1.2.3")).toBeLessThan(0);
  });

  it("supports v prefix and build metadata", () => {
    expect(compareVersions("v1.2.3+build.1", "1.2.3")).toBe(0);
  });

  it("handles prerelease precedence", () => {
    expect(compareVersions("1.2.3-beta.2", "1.2.3-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3-beta.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBeLessThan(0);
  });

  it("isNewerVersion works for prerelease channels", () => {
    expect(isNewerVersion("1.2.3-beta.2", "1.2.3-beta.1")).toBe(true);
    expect(isNewerVersion("1.2.3", "1.2.3-beta.2")).toBe(true);
    expect(isNewerVersion("1.2.3-beta.1", "1.2.3")).toBe(false);
  });
});
