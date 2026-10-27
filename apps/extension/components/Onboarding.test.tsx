// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";
import { connectToken, getSettings, getPlans, savePlan, clearSettings } from "@/lib/messaging";

vi.mock("@/lib/messaging", () => ({
  connectToken: vi.fn(), getSettings: vi.fn(), getPlans: vi.fn(), savePlan: vi.fn(), clearSettings: vi.fn(),
  checkModel: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
const done = vi.fn();
const budgets = [{ id: "test-a", name: "Test A" }, { id: "test-b", name: "Test B" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getSettings).mockResolvedValue({ hasToken: false });
  vi.mocked(connectToken).mockResolvedValue({ plans: budgets });
  vi.mocked(getPlans).mockResolvedValue({ plans: budgets });
  vi.mocked(savePlan).mockResolvedValue({});
  vi.mocked(clearSettings).mockResolvedValue();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<Onboarding onComplete={done} />)); }
async function enterToken() {
  const input = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "test-only-token");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  return input;
}

describe("local onboarding", () => {
  it("hides and clears token entry, then waits for an explicit budget choice", async () => {
    await mount();
    expect(host.querySelector("input")?.type).toBe("password");
    const input = await enterToken();
    expect(connectToken).toHaveBeenCalledWith("test-only-token");
    expect(input.value).toBe("");
    const select = host.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("");
    expect(savePlan).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    await act(async () => { select.value = "test-b"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Use selected"))!;
    await act(async () => save.click());
    expect(savePlan).toHaveBeenCalledWith("test-b", "Test B");
    expect(done).toHaveBeenCalledWith(budgets[1]);
  });

  it("clears the input even when validation fails", async () => {
    vi.mocked(connectToken).mockResolvedValue({ error: "Invalid or revoked token." });
    await mount();
    await enterToken();
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("");
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Invalid or revoked");
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("restores an unfinished connection without retrieving the credential", async () => {
    vi.mocked(getSettings).mockResolvedValue({ hasToken: true, planId: null });
    await mount();
    expect(getPlans).toHaveBeenCalledOnce();
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("");
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("keeps a failed save visible without finishing onboarding", async () => {
    vi.mocked(getSettings).mockResolvedValue({ hasToken: true });
    vi.mocked(savePlan).mockResolvedValue({ error: "Test budget unavailable." });
    await mount();
    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "test-a"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Use selected"))!.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain("unavailable");
    expect(done).not.toHaveBeenCalled();
  });

  it("allows removing a saved token when budget loading fails", async () => {
    vi.mocked(getSettings).mockResolvedValue({ hasToken: true });
    vi.mocked(getPlans).mockRejectedValue(new Error("offline"));
    await mount();
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Remove local"))!.click());
    expect(clearSettings).toHaveBeenCalledOnce();
    expect(host.querySelector("input")?.type).toBe("password");
  });
});

it("can cancel validation and ignores its late response", async () => {
  let finish!: (response: { plans: typeof budgets }) => void;
  vi.mocked(connectToken).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await mount();
  await enterToken();
  await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Cancel connection"))!.click());
  expect(clearSettings).toHaveBeenCalledOnce();
  await act(async () => finish({ plans: budgets }));
  expect(host.querySelector("input")?.type).toBe("password");
  expect(host.querySelector("select")).toBeNull();
  expect(done).not.toHaveBeenCalled();
});

it("keeps completed diagnostics off onboarding without starting authentication or model downloads", async () => {
  await mount();
  expect(host.textContent).not.toMatch(/Start model download check|Local cancellation check|Amazon.ca page check|Local data removal/);
  expect(connectToken).not.toHaveBeenCalled();
  expect(getPlans).not.toHaveBeenCalled();
});
