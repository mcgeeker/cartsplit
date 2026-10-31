import { browser } from "wxt/browser";
import type { MessageRequest } from "@/lib/types";

import { SIDEBAR_COMMANDS } from "@/lib/verification";
import { LOOKUP_COMMANDS } from "@/lib/register-lookup";

/** A self extension id alone also admits content scripts. Privileged requests
 * must come from the actual sidebar page, with no tab. Retired content-result and batch
 * messages have no receiver. */
export function createUiMessageListener(dispatch: (message: MessageRequest) => Promise<unknown>) {
  return (message: unknown, sender: { id?: string; url?: string; tab?: unknown }, sendResponse: (value: unknown) => void) => {
    if (!message || typeof message !== "object") {
      sendResponse({ error: "Invalid extension request." });
      return false;
    }
    const type = (message as { type?: unknown }).type;
    if (typeof type === "string" && LOOKUP_COMMANDS.has(type)) return false;
    if (sender.id !== browser.runtime.id || sender.tab !== undefined ||
        sender.url !== browser.runtime.getURL("/sidepanel.html")) {
      sendResponse({ error: "This command is only available in the extension sidebar." });
      return false;
    }
    if (typeof type !== "string" || !SIDEBAR_COMMANDS.has(type)) {
      sendResponse({ error: "Unknown extension request." });
      return false;
    }
    if (type === "SAVE_PLAN" && typeof (message as { planId?: unknown }).planId !== "string") {
      sendResponse({ error: "Choose a YNAB budget." });
      return false;
    }
    dispatch(message as MessageRequest).then(sendResponse).catch(() => {
      sendResponse({ error: "Could not complete the extension request. Try again." });
    });
    return true;
  };
}
