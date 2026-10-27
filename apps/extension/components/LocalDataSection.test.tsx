// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import LocalDataSection from "./LocalDataSection";
vi.mock("./LocalDataCleanup", () => ({ default: () => <p>Cleanup tool mounted</p> }));

it.each([true, false])("only mounts cleanup after opening while disconnected (connected=%s)", async connected => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LocalDataSection connected={connected} />));
    expect(host.textContent).not.toContain("Cleanup tool mounted");
    const details = host.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(host.textContent).toContain("Product-category learning");
    if (connected) {
      expect(host.textContent).not.toContain("Cleanup tool mounted");
      expect(host.querySelector("button")!.disabled).toBe(true);
      expect(host.textContent).toContain("Disconnect YNAB first");
    } else expect(host.textContent).toContain("Cleanup tool mounted");
    await act(async () => { details.open = false; details.dispatchEvent(new Event("toggle")); });
    expect(host.textContent).not.toContain("Cleanup tool mounted");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
