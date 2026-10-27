// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "../entrypoints/sidepanel/App";
vi.mock("@/lib/messaging", () => ({ getSettings: async () => ({ hasToken: true, planId: "test-a", planName: "Test A" }) }));
vi.mock("@/components/ConnectionCheck", () => ({ default: ({ plan, onDisconnect }: any) => <div>{plan.name}<button onClick={onDisconnect}>Disconnect</button></div> }));
vi.mock("@/components/Onboarding", () => ({ default: ({ onComplete }: any) => <button onClick={() => onComplete({ id: "test-b", name: "Test B" })}>Choose Test B</button> }));
it("unmounts the old workspace on disconnect and mounts a fresh one on reconnect", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  try {
    await act(async () => root.render(<App />));
    expect(host.textContent).toContain("Test A");
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).not.toContain("Test A");
    await act(async () => host.querySelector("button")!.click());
    expect(host.textContent).toContain("Test B");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
