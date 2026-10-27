import { it, expect } from "vitest";
import { CANADIAN_PREVIEW_FAILURES, canadianPreviewFailureText } from "./canadian-preview-status";
it("renders only known closed diagnostic messages", () => {
  for (const [code, text] of Object.entries(CANADIAN_PREVIEW_FAILURES)) expect(canadianPreviewFailureText(code)).toBe(text);
  for (const value of [undefined, null, {}, "constructor", "__proto__", "https://private.invalid/?orderID=private", "test-only-token"]) expect(canadianPreviewFailureText(value)).toBeNull();
});
