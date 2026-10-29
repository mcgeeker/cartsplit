// All requests use fake I/O; no real token or financial operation.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { connectPersonalToken, resolveSelectedPlan } from "./connection";
import { clearSettings, getPublicSettings, getSettings, saveSettings } from "@/lib/settings";
import { getValidAccessToken, NeedsReauthError } from "@/lib/auth";
import { getCategories, getPlans } from "@/lib/ynab";



const TOKEN = "test-only-personal-token";
const budgets = [{ id: "test-a", name: "Test A" }, { id: "test-b", name: "Test B" }];
const fetchMock = vi.fn();
function plansResponse(plans = budgets) { return new Response(JSON.stringify({ data: { plans } })); }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("direct Personal Access Token connection", () => {
  it("validates directly, persists only after validation, and selects no default budget", async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { complete = resolve; }));
    const connecting = connectPersonalToken(`  ${TOKEN}  `);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(await getSettings()).toEqual({ accessToken: null, planId: null, planName: null });
    complete(plansResponse());
    expect(await connecting).toEqual({ plans: budgets });
    expect(fetchMock).toHaveBeenCalledWith("https://api.ynab.com/v1/plans", expect.objectContaining({
      redirect: "error", credentials: "omit", headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
    }));
    expect(await getSettings()).toEqual({ accessToken: TOKEN, planId: null, planName: null });
    expect(await getPublicSettings()).toEqual({ hasToken: true, planId: null, planName: null });
    expect(JSON.stringify(await connecting)).not.toContain(TOKEN);
  });

  it.each(["", " ", "bad\ntoken", "bad token", "x".repeat(4097), null, 123])("rejects malformed input before network or storage: %j", async (input) => {
    await expect(connectPersonalToken(input)).rejects.toThrow("Personal Access Token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getSettings()).accessToken).toBeNull();
  });

  it.each([401, 403, 429, 500])("does not persist or refresh a token rejected with HTTP %i", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(TOKEN, { status }));
    const error = await connectPersonalToken(TOKEN).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(TOKEN);
    expect((await getSettings()).accessToken).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps arbitrary network errors out of responses", async () => {
    fetchMock.mockRejectedValueOnce(new Error(`request contained ${TOKEN}`));
    await expect(connectPersonalToken(TOKEN)).rejects.toThrow("Could not reach YNAB");
    expect((await getSettings()).accessToken).toBeNull();
  });

  it.each([{}, { data: { plans: null } }, { data: { plans: [{ id: "test-a" }] } }])("rejects malformed budget responses", async (payload) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    await expect(connectPersonalToken(TOKEN)).rejects.toThrow("unreadable budget list");
    expect((await getSettings()).accessToken).toBeNull();
  });

  it("rejects an empty budget list without saving the token", async () => {
    fetchMock.mockResolvedValueOnce(plansResponse([]));
    await expect(connectPersonalToken(TOKEN)).rejects.toThrow("No token was saved");
    expect((await getSettings()).accessToken).toBeNull();
  });

  it("refuses silent replacement of a connected token or budget", async () => {
    await saveSettings({ accessToken: TOKEN, planId: "test-a", planName: "Test A" });
    await expect(connectPersonalToken("test-only-replacement")).rejects.toThrow("Remove the local connection");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getSettings()).planId).toBe("test-a");
  });

  it("does not select even a single returned budget", async () => {
    fetchMock.mockResolvedValueOnce(plansResponse([budgets[0]!]));
    await connectPersonalToken(TOKEN);
    expect((await getSettings()).planId).toBeNull();
  });

  it("rechecks an explicit choice against current access and uses the API name", async () => {
    await saveSettings({ accessToken: TOKEN });
    fetchMock.mockResolvedValueOnce(plansResponse());
    expect(await resolveSelectedPlan("test-b")).toEqual(budgets[1]);
    fetchMock.mockResolvedValueOnce(plansResponse());
    await expect(resolveSelectedPlan("not-accessible")).rejects.toThrow("Choose an available");
    expect((await getSettings()).planId).toBeNull();
  });
});

describe("personal-token API requests", () => {
  it("uses a saved token without expiry or refresh credentials", async () => {
    await saveSettings({ accessToken: TOKEN });
    expect(await getValidAccessToken()).toBe(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(plansResponse());
    expect(await getPlans()).toEqual(budgets);
  });

  it("rejects an absent token without making a request", async () => {
    await expect(getPlans()).rejects.toBeInstanceOf(NeedsReauthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not refresh or retry a revoked token", async () => {
    await saveSettings({ accessToken: TOKEN, planId: "test-a" });
    fetchMock.mockResolvedValueOnce(new Response(TOKEN, { status: 401 }));
    await expect(getPlans())
      .rejects.toBeInstanceOf(NeedsReauthError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^https:\/\/api\.ynab\.com\/v1\//);
  });


  it("reports malformed JSON without echoing the response body", async () => {
    await saveSettings({ accessToken: TOKEN });
    fetchMock.mockResolvedValueOnce(new Response(TOKEN));
    await expect(getPlans()).rejects.toThrow("unreadable response");
  });

  it("disconnects locally without calling a revocation service", async () => {
    await saveSettings({ accessToken: TOKEN });
    await clearSettings();
    await expect(getCategories("test-a")).rejects.toBeInstanceOf(NeedsReauthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it.each([
  null, {}, { category_groups: {} },
  { category_groups: [{ name: "Test", hidden: "false", deleted: false, categories: [] }] },
  { category_groups: [{ name: "Test", hidden: false, deleted: false, categories: [{ id: "../bad", name: "Synthetic", hidden: false, deleted: false }] }] },
  { category_groups: [{ name: "Test", hidden: false, deleted: false, categories: [{ id: "same", name: "First", hidden: false, deleted: false }, { id: "same", name: "Second", hidden: false, deleted: false }] }] },
])("rejects malformed or ambiguous category data before exposing choices", async data => {
  await saveSettings({ accessToken: TOKEN });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data })));
  await expect(getCategories("test-a")).rejects.toThrow("unreadable category list");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("keeps the returned group/category sequence and identities while filtering unavailable categories", async () => {
  await saveSettings({ accessToken: TOKEN });
  const category = (id: string, name: string, hidden = false) => ({ id, name, hidden, deleted: false });
  const group = (id: string, name: string, categories: ReturnType<typeof category>[], hidden = false) =>
    ({ id, name, categories, hidden, deleted: false });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { category_groups: [
    group("group-z", "Everyday", [category("z", "🛒 Groceries"), category("hidden", "Hidden", true), category("b", "Transport")]),
    group("hidden-group", "Hidden group", [category("hidden-child", "Hidden child")], true),
    group("internal", "Internal Master Category", [category("internal-child", "Internal")]),
    group("group-a", "Annual", [category("a", "Annual fees")]),
    group("same-name", "Everyday", [category("c", "Other")]),
  ] } })));
  expect(await getCategories("test-a")).toEqual([
    { id: "z", name: "🛒 Groceries", groupName: "Everyday", groupId: "group-z" },
    { id: "b", name: "Transport", groupName: "Everyday", groupId: "group-z" },
    { id: "a", name: "Annual fees", groupName: "Annual", groupId: "group-a" },
    { id: "c", name: "Other", groupName: "Everyday", groupId: "same-name" },
  ]);
});
