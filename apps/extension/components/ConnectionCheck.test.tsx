// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import App from "../entrypoints/sidepanel/App";
import { getSettings, getCategories, refreshCategories, clearSettings } from "@/lib/messaging";

vi.mock("./useActiveOrderContext",()=>({useActiveOrderContext:()=>({orderKey:"synthetic",tabId:1,ready:true})}));
vi.mock("./useReviewTabState",()=>({useReviewTabState:()=>"active"}));
vi.mock("./useActiveOrderTab",()=>({useActiveOrderTab:()=>true}));
vi.mock("./AmazonTransactionsLink",()=>({default:()=>null}));
vi.mock("wxt/browser", () => ({ browser: { runtime: { getManifest: () => ({ version: "1.4.0" }) } } }));
vi.mock("@/lib/messaging", () => ({
  getPurchaseOrderSession:vi.fn(async()=>({session:null})),
  cancelCanadianApproval: vi.fn(async () => {}), getSettings: vi.fn(), getCategories: vi.fn(), refreshCategories: vi.fn(), clearSettings: vi.fn(),
  previewTestSplit: vi.fn(), sync: vi.fn(), approveBatch: vi.fn(), approveTransaction: vi.fn(), openRetailer: vi.fn(),
}));
vi.mock("@/components/Onboarding", () => ({ default: () => <p>Token entry</p> }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getSettings).mockResolvedValue({ hasToken: true, planId: "test-a", planName: "Extension Test Budget" });
  vi.mocked(getCategories).mockResolvedValue({ categories: [{ id: "test-cat", name: "Test category", groupName: "Test group" }] });
  vi.mocked(refreshCategories).mockResolvedValue({});
  vi.mocked(clearSettings).mockResolvedValue();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<App />)); }
async function click(text: string) {
  await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === text)!.click());
}

describe("read-only browser check UI", () => {
  it("shows the chosen budget/category count without auto-sync or transaction controls", async () => {
    await mount();
    expect(host.textContent).toContain("Amazon.ca");
    expect(host.textContent).toContain("Extension Test Budget");
    expect(host.textContent).toContain("Categories Loaded: 1");
    expect(host.textContent).toContain("Connected YNAB Plan:");
    const categoryList = [...host.querySelectorAll("details")].find(detail => detail.querySelector(":scope > summary")?.textContent === "Categories Loaded: 1")!;
    expect(categoryList.open).toBe(false);
    await act(async () => categoryList.querySelector("summary")!.click());
    expect(categoryList.open).toBe(true);
    expect(categoryList.querySelector("li")?.textContent).toBe("Test category");
    expect(host.textContent).not.toMatch(/dummy|simulated|One-use|gift-card preview|Local suggestion/);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Review selected order", "Refresh budget categories", "Disconnect YNAB"]);
  });

  it("refreshes categories and reports the server-read success", async () => {
    await mount();
    await click("Refresh budget categories");
    expect(refreshCategories).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Categories refreshed from YNAB");
  });

  it("keeps disconnect available while a category refresh is pending", async () => {
    let finish!: (result: {}) => void;
    vi.mocked(refreshCategories).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await mount();
    await click("Refresh budget categories");
    await click("Disconnect YNAB");
    expect(clearSettings).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Token entry");
    await act(async () => finish({}));
    expect(host.textContent).toContain("Token entry");
  });

  it("keeps a failed local removal visible instead of claiming it disconnected", async () => {
    vi.mocked(clearSettings).mockRejectedValue(new Error("test-only failure"));
    await mount();
    await click("Disconnect YNAB");
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Could not remove");
    expect(host.textContent).not.toContain("Token entry");
  });
});
