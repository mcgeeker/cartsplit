import { installRegisterButtons } from "@/retailers/ynab/register";

export default defineContentScript({
  matches: ["https://app.ynab.com/*"],
  runAt: "document_idle",
  main(ctx) {
    const stop = installRegisterButtons(document, () => location.href, async purchase => {
      const result = await browser.runtime.sendMessage({ type: "LOOKUP_START", purchase });
      if (!result?.ok) throw Error("Lookup unavailable.");
      if (result.busy) return "An Amazon lookup is already running. Follow it in CartSplit, or cancel it before starting another.";
      if (!result.sidebarOpen) return "Lookup started. Open the CartSplit sidebar to see progress and choices.";
    });
    ctx.onInvalidated(stop);
  },
});
