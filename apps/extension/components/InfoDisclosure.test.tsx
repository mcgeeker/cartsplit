// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import InfoDisclosure from "./InfoDisclosure";

it("previews guidance on hover/focus, expands it on click, and dismisses it with Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<InfoDisclosure label="Adjustment guidance">Synthetic guidance.</InfoDisclosure>));
    const button = host.querySelector("button")!, content = host.querySelector<HTMLElement>(`[id="${button.getAttribute("aria-controls")}"]`)!;
    expect(button.getAttribute("aria-label")).toBe("Adjustment guidance information");
    expect(content.hidden).toBe(true); expect(host.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe("Synthetic guidance."); expect(content.hidden).toBe(true);
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true"); expect(content.hidden).toBe(false); expect(host.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(content.hidden).toBe(true); expect(host.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.focus()); expect(host.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () => button.blur()); expect(host.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.click()); await act(async () => button.click());
    expect(content.hidden).toBe(true); expect(button.getAttribute("aria-expanded")).toBe("false");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
