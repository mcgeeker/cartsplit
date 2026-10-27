import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { clearSettings, getPublicSettings, getSettings, saveSettings } from "./settings";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe("local connection persistence", () => {
  it("starts disconnected and preserves the token while saving a budget", async () => {
    expect(await getPublicSettings()).toEqual({ hasToken: false, planId: null, planName: null });
    await saveSettings({ accessToken: "test-only-token" });
    await saveSettings({ planId: "test-budget", planName: "Extension Test" });
    expect(await getSettings()).toEqual({ accessToken: "test-only-token", planId: "test-budget", planName: "Extension Test" });
  });

  it("returns an explicit credential-free projection even with legacy fields", async () => {
    await saveSettings({ accessToken: "test-only-token", refreshToken: "test-only-legacy", accessTokenExpiresAt: 0 } as never);
    const result = await getPublicSettings();
    expect(result).toEqual({ hasToken: true, planId: null, planName: null });
    expect(JSON.stringify(result)).not.toContain("test-only");
    expect(await getSettings()).not.toHaveProperty("refreshToken");
  });

  it("removes the connection including the saved budget", async () => {
    await saveSettings({ accessToken: "test-only-token", planId: "test-budget", planName: "Extension Test" });
    await clearSettings();
    expect(await getSettings()).toEqual({ accessToken: null, planId: null, planName: null });
  });

  it("keeps concurrent partial updates in one IndexedDB transaction each", async () => {
    await Promise.all([saveSettings({ accessToken: "test-only-token" }), saveSettings({ planId: "test-budget" })]);
    expect(await getSettings()).toMatchObject({ accessToken: "test-only-token", planId: "test-budget" });
  });
});
