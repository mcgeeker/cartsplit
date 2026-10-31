import { calendarDate, isAmazonPayee, isIdentifier, registerContext, type RegisterPurchase } from "@/lib/register-lookup";
import cartsplitMark from "../../../../packages/ui/src/mark.svg?raw";

// YNAB's public register DOM; never inspect Ember models or page-world globals.
export const REGISTER_ROWS = ".ynab-grid-body-row";
function text(row: Element, selector: string): string {
  const node = row.querySelector(selector)?.cloneNode(true) as Element | undefined;
  node?.querySelectorAll("[data-cartsplit-lookup]").forEach(el => el.remove());
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
function cents(value: string): number | null {
  const match = value.replace(/\u00a0/g, " ").match(/^(?:(?:CA\$|C\$|CAD|\$)\s*)?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
  if (!match) return null;
  const result = Number(match[1]!.replaceAll(",", "")) * 100 + Number(match[2]);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
export function readRegisterRow(row: Element, href: string): RegisterPurchase | null {
  const context = registerContext(href);
  // Attachment/file and hidden inputs are present even on display-only YNAB
  // rows. They do not indicate an active transaction editor.
  if (!context || row.matches(".ynab-grid-body-sub, .ynab-grid-body-row-scheduled, .is-editing") || row.querySelector("input:not([type=checkbox]):not([type=file]):not([type=hidden]), textarea")) return null;
  const payee = text(row, ".ynab-grid-cell-payeeName, .ynab-grid-cell-payee");
  const amount = cents(text(row, ".ynab-grid-cell-outflow"));
  const inflow = text(row, ".ynab-grid-cell-inflow");
  if (!isAmazonPayee(payee) || amount === null || (inflow && cents(inflow) !== null)) return null;
  const transactionId = row.getAttribute("data-row-id") ?? row.getAttribute("data-transaction-id");
  if (isIdentifier(transactionId)) return { ...context, transactionId, cents: amount, payee };
  const cell = row.querySelector(".ynab-grid-cell-date");
  const date = cell?.querySelector("time")?.getAttribute("datetime") ?? cell?.getAttribute("data-date") ?? text(row, ".ynab-grid-cell-date");
  // Ambiguous display dates must never be guessed. Stable row IDs avoid locale parsing.
  return calendarDate(date) !== null ? { ...context, date, cents: amount, payee } : null;
}
export function installRegisterButtons(doc: Document, href: () => string, start: (purchase: RegisterPurchase) => Promise<void | string>): () => void {
  let queued = false, stopped = false;
  let notice: HTMLElement | undefined, noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearNotice = () => { notice?.remove(); notice = undefined; clearTimeout(noticeTimer); };
  const showNotice = (message: string) => {
    clearNotice();
    notice = doc.createElement("div"); notice.dataset.cartsplitLookupNotice = "true"; notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;inset-inline-end:16px;bottom:16px;z-index:2147483647;max-width:min(350px,calc(100vw - 32px));padding:12px;border-radius:8px;background:#155e63;color:#fff;font:14px/1.4 sans-serif;box-shadow:0 2px 12px #0004";
    const text = doc.createElement("span"); text.textContent = message;
    const close = doc.createElement("button"); close.type = "button"; close.textContent = "Dismiss";
    close.style.cssText = "display:block;margin-top:8px;padding:3px 8px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer";
    close.addEventListener("click", clearNotice); notice.append(text, close); doc.body.append(notice);
    noticeTimer = setTimeout(clearNotice, 12000);
  };
  const style = doc.createElement("style");
  style.textContent = `
    .cartsplit-lookup-cell { position: relative !important; padding-inline-start: 32px !important; }
    [data-cartsplit-lookup] { position: absolute; inset-inline-start: 4px; top: 50%; transform: translateY(-50%); display: inline-flex; }
    [data-cartsplit-lookup] button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 24px; height: 24px; margin: 0; padding: 3px; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
    [data-cartsplit-lookup] button:hover { background: #155e6320; }
    [data-cartsplit-lookup] button:focus-visible { outline: 2px solid #155e63; outline-offset: 1px; }
    [data-cartsplit-lookup] button:disabled { opacity: .5; cursor: wait; }
    [data-cartsplit-lookup] button[data-lookup-error] { outline: 2px solid #b42318; }
    [data-cartsplit-lookup] [role=status] { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `;
  doc.head.append(style);
  const remove = (row: Element) => {
    row.querySelectorAll("[data-cartsplit-lookup]").forEach(el => el.remove());
    row.querySelectorAll(".cartsplit-lookup-cell").forEach(el => el.classList.remove("cartsplit-lookup-cell"));
  };
  const refresh = () => {
    queued = false;
    if (stopped) return;
    for (const row of doc.querySelectorAll(REGISTER_ROWS)) {
      const purchase = readRegisterRow(row, href());
      const old = row.querySelector<HTMLElement>("[data-cartsplit-lookup]");
      if (!purchase) { remove(row); continue; }
      const cell = row.querySelector(".ynab-grid-cell-payeeName, .ynab-grid-cell-payee")!;
      if (!cell.classList.contains("cartsplit-lookup-cell")) cell.classList.add("cartsplit-lookup-cell");
      if (old?.parentElement === cell) continue; // Click rereads virtualized rows.
      old?.remove();
      const holder = doc.createElement("span"); holder.dataset.cartsplitLookup = "true";
      const button = doc.createElement("button"); button.type = "button";
      button.setAttribute("aria-label", "Open Amazon order"); button.title = "Open Amazon order with CartSplit";
      const icon = doc.importNode(new DOMParser().parseFromString(cartsplitMark, "image/svg+xml").documentElement, true);
      icon.setAttribute("width", "18"); icon.setAttribute("height", "18"); icon.setAttribute("aria-hidden", "true"); icon.setAttribute("focusable", "false");
      button.append(icon);
      const status = doc.createElement("span"); status.setAttribute("role", "status");
      button.addEventListener("click", async event => {
        event.preventDefault(); event.stopPropagation();
        if (!event.isTrusted || button.disabled) return;
        const current = readRegisterRow(row, href());
        if (!current) { refresh(); return; }
        button.disabled = true; delete button.dataset.lookupError; status.textContent = "Checking…"; button.title = "Checking purchase…";
        try { const message = await start(current); status.textContent = message ?? ""; button.title = message || "Open Amazon order with CartSplit"; if (message && !stopped) showNotice(message); }
        catch { status.textContent = "Could not start lookup. Check the selected CartSplit plan."; button.title = status.textContent; button.dataset.lookupError = "true"; }
        finally { button.disabled = false; }
      });
      holder.append(button, status);
      cell.append(holder);
    }
  };
  const queue = () => { if (!queued && !stopped) { queued = true; queueMicrotask(refresh); } };
  const observer = new MutationObserver(queue);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-row-id", "data-transaction-id", "class"] });
  doc.defaultView?.addEventListener("hashchange", queue);
  doc.defaultView?.addEventListener("popstate", queue);
  const timer = setInterval(queue, 1000); refresh();
  return () => { stopped = true; observer.disconnect(); clearInterval(timer); clearNotice(); doc.defaultView?.removeEventListener("hashchange", queue); doc.defaultView?.removeEventListener("popstate", queue); remove(doc.body); style.remove(); };
}
