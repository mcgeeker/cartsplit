// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { readRegisterRow, installRegisterButtons } from "./register";
import { registerContext } from "@/lib/register-lookup";
const url = "https://app.ynab.com/test-plan/accounts/test-account";
function row(extra = "", id = 'data-row-id="test-tx"') {
  document.body.innerHTML = `<div class="ynab-grid-body-row ${extra}" ${id}><div class="ynab-grid-cell-date">2026-10-22</div><div class="ynab-grid-cell-payeeName">Amazon.ca</div><div class="ynab-grid-cell-outflow">$1,234.56</div><div class="ynab-grid-cell-inflow"></div></div>`;
  return document.body.firstElementChild!;
}
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
it("reads stable parent identity and exact cents from supported register routes", () => {
  expect(readRegisterRow(row(), url)).toEqual({ planId: "test-plan", accountId: "test-account", transactionId: "test-tx", cents: 123456, payee: "Amazon.ca" });
  expect(registerContext(url.replace("/test-plan", "/#/test-plan"))).toEqual({ planId: "test-plan", accountId: "test-account" });
  expect(registerContext("https://app.ynab.com/test-plan/accounts")).toBeNull();
  expect(registerContext(url.replace("app.ynab.com", "evil.invalid"))).toBeNull();
});
it("supports reconciled/categorized parent rows but excludes split children, schedules, inflows and editing", () => {
  expect(readRegisterRow(row("is-reconciled"), url)).not.toBeNull();
  for (const extra of ["ynab-grid-body-sub", "ynab-grid-body-row-scheduled", "is-editing"]) expect(readRegisterRow(row(extra), url)).toBeNull();
  const r = row(); r.querySelector(".ynab-grid-cell-inflow")!.textContent = "$1.00"; expect(readRegisterRow(r, url)).toBeNull();
  r.querySelector(".ynab-grid-cell-inflow")!.textContent = ""; r.querySelector(".ynab-grid-cell-outflow")!.textContent = "-$1.00"; expect(readRegisterRow(r, url)).toBeNull();
});
it("falls back only to an unambiguous full ISO date", () => {
  const r = row("", ""); expect(readRegisterRow(r, url)).toMatchObject({ date: "2026-10-22" });
  r.querySelector(".ynab-grid-cell-date")!.textContent = "10/11/2026"; expect(readRegisterRow(r, url)).toBeNull();
});
it("keeps lookup available with YNAB's attachment input and zero-valued inflow cell", async () => {
  const r = row("ynab-grid-body-parent");
  const attachment = document.createElement("input"); attachment.type = "file"; attachment.hidden = true;
  const hidden = document.createElement("input"); hidden.type = "hidden";
  r.prepend(attachment, hidden);
  r.querySelector(".ynab-grid-cell-outflow")!.innerHTML = '<span class="user-data currency tabular-nums positive"><bdi>$</bdi>1,234.56&nbsp;</span>';
  r.querySelector(".ynab-grid-cell-inflow")!.innerHTML = '<span class="user-data currency tabular-nums"><bdi>$</bdi>0.00&nbsp;</span>';
  expect(readRegisterRow(r, url)).toMatchObject({ transactionId: "test-tx", cents: 123456 });
  const stop = installRegisterButtons(document, () => url, vi.fn());
  try {
    expect(r.querySelector<HTMLButtonElement>("button")?.getAttribute("aria-label")).toBe("Open Amazon order");
    const editor = document.createElement("input"); editor.type = "text"; r.append(editor);
    await Promise.resolve(); await Promise.resolve();
    expect(readRegisterRow(r, url)).toBeNull(); expect(r.querySelector("button")).toBeNull();
  } finally { stop(); }
});
it("uses the CartSplit mark inside the Payee column without adding visible payee text",async()=>{
  const r=row(), payee=r.querySelector('.ynab-grid-cell-payeeName')!;
  payee.innerHTML='<div class="ynab-grid-cell-inner"><span class="ynab-grid-cell-inner-payee-name">Amazon.ca</span></div>';
  const stop=installRegisterButtons(document,()=>url,vi.fn());
  try{
    const button=payee.querySelector('button')!;
    expect(button.textContent?.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Open Amazon order');
    expect(button.title).toContain('CartSplit');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 28 28');
    expect(readRegisterRow(r,url)?.payee).toBe('Amazon.ca');
    // YNAB can replace host classes while retaining the cell's children.
    payee.classList.remove('cartsplit-lookup-cell');
    await Promise.resolve();await Promise.resolve();
    expect(payee.classList.contains('cartsplit-lookup-cell')).toBe(true);
    expect(r.querySelectorAll('button')).toHaveLength(1);
  }finally{stop();}
  expect(payee.querySelector('button')).toBeNull();
  expect(payee.classList.contains('cartsplit-lookup-cell')).toBe(false);
  expect(payee.textContent).toBe('Amazon.ca');
});
it("keeps one button through recycled rows and route changes, and ignores programmatic clicks", async () => {
  const r = row(), start = vi.fn(); let href = url;
  const stop = installRegisterButtons(document, () => href, start);
  try {
    expect(r.querySelectorAll("button")).toHaveLength(1);
    r.setAttribute("data-row-id", "other-tx"); await Promise.resolve(); await Promise.resolve();
    expect(r.querySelectorAll("button")).toHaveLength(1);
    expect(readRegisterRow(r, href)?.transactionId).toBe("other-tx");
    r.querySelector<HTMLButtonElement>("button")!.click(); expect(start).not.toHaveBeenCalled();
    href = "https://app.ynab.com/test-plan/budget"; window.dispatchEvent(new Event("popstate")); await Promise.resolve();
    expect(r.querySelector("button")).toBeNull();
  } finally { stop(); }
});
