// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { SyntheticEvent } from "react";
import { revealExpandedContent, scrollExpandedDetails } from "./useRevealScroll";

afterEach(() => vi.unstubAllGlobals());
function section(top: number, height: number, contentTop = top + 24, contentHeight = height - 24) {
  vi.stubGlobal("innerHeight", 600);
  const details = document.createElement("details");
  details.innerHTML = "<summary>Expand</summary><div><p>Content</p></div>";
  details.open = true;
  const content = details.querySelector("p")!;
  details.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
  content.getBoundingClientRect = () => new DOMRect(0, contentTop, 300, contentHeight);
  details.scrollIntoView = vi.fn(); content.scrollIntoView = vi.fn();
  return { details, content, toggle: () => scrollExpandedDetails({ target: details, currentTarget: details } as unknown as SyntheticEvent<HTMLDetailsElement>) };
}
it("does not scroll an expanded memo or section that is already fully visible", () => {
  const { details, toggle } = section(200, 180);
  toggle(); expect(details.scrollIntoView).not.toHaveBeenCalled();
});
it.each([false,true])("reveals a clipped memo at the nearest edge, respecting reduced motion=%s", reduced => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced })));
  const { details, toggle } = section(500, 180);
  toggle(); expect(details.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: reduced ? "instant" : "smooth", block: "nearest", inline: "nearest" });
});
it("leaves a long expanded section still when its first content is visible", () => {
  const { details, content, toggle } = section(200, 1400, 230, 60);
  toggle(); expect(details.scrollIntoView).not.toHaveBeenCalled(); expect(content.scrollIntoView).not.toHaveBeenCalled();
});
it("reveals only the first content of a long section when it is below the viewport", () => {
  const { details, content, toggle } = section(570, 1400, 610, 60);
  toggle(); expect(details.scrollIntoView).not.toHaveBeenCalled();
  expect(content.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
});
it("does not scroll on collapse or respond to a nested section's toggle", () => {
  const { details, toggle } = section(500, 180); details.open = false; toggle();
  details.open = true; scrollExpandedDetails({ target: document.createElement("details"), currentTarget: details } as unknown as SyntheticEvent<HTMLDetailsElement>);
  expect(details.scrollIntoView).not.toHaveBeenCalled(); revealExpandedContent(null);
});
it("keeps the start of oversized guidance visible without aligning it to the top", () => {
  const { details, content, toggle } = section(200, 1400, 230, 1300);
  toggle(); expect(details.scrollIntoView).not.toHaveBeenCalled(); expect(content.scrollIntoView).not.toHaveBeenCalled();
});
