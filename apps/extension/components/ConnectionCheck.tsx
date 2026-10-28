import DataPrivacyNotice from "./DataPrivacyNotice";
import {scrollExpandedDetails} from "./useRevealScroll";
import PurchaseReview from "./PurchaseReviewWorkspace";
import LocalDataSection from "./LocalDataSection";
import { useEffect, useState } from "react";
import type { Category } from "@/lib/types";
import { BrandRow, Button, LinkButton, StatusMessage } from "@lineitem/ui";
import { clearSettings, getCategories, refreshCategories, type PlanInfo } from "@/lib/messaging";

/** Compact selected-order Canadian workspace with connection settings. */
export default function ConnectionCheck({ plan, onDisconnect, onChangePlan }: { plan: PlanInfo; onDisconnect: () => void; onChangePlan?: () => void }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    let active = true;
    getCategories().then((result) => {
      if (!active) return;
      if (result.error || !result.categories) setError(result.error || "Could not load categories.");
      else setCategories(result.categories);
    }).catch(() => { if (active) setError("Could not load categories."); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setBusy(true); setError(null); setRefreshed(false);
    try {
      const result = await refreshCategories();
      if (result.error) throw new Error(result.error);
      const categories = await getCategories();
      if (categories.error || !categories.categories) throw new Error(categories.error || "Could not load categories.");
      setCategories(categories.categories);
      setRefreshed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh categories.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError(null);
    try {
      await clearSettings();
      onDisconnect();
    } catch { setError("Could not remove the local connection. Try again."); }
    finally { setBusy(false); }
  }

  return <div className="flex min-h-screen flex-col gap-4 bg-bg p-4 text-text">
    <header>
      <BrandRow size={34} />
      <p className="mt-2 text-muted">Categorize your Amazon.ca purchases in YNAB.</p>
    </header>
    <PurchaseReview key={plan.id} categories={categories ?? []} />
    <details onToggle={scrollExpandedDetails} className="scroll-mt-3 rounded-control border border-line p-3">
      <summary className="cursor-pointer font-semibold">Connection settings</summary>
      <div className="mt-1 flex flex-col gap-3">
        <section aria-label="YNAB connection" className="rounded-control bg-surface-2 px-3 py-2">
          <p className="pl-3 -indent-3 text-[14px] font-semibold leading-snug">
            <span className="font-semibold">Connected YNAB Plan:</span>
            {" "}<span className="inline-block max-w-full break-words align-top indent-0 font-semibold">{plan.name}</span>
          </p>
          {categories === null ? <p role="status" className="mt-2 text-[13px] text-muted">Loading categories…</p> :
            <details onToggle={scrollExpandedDetails} className="scroll-mt-3 mt-2 text-[13px]">
              <summary className="cursor-pointer text-muted">Categories Loaded: {categories.length}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-text">
                {categories.map(category => <li key={category.id} className="break-words">{category.name}</li>)}
              </ul>
              {categories.length === 0 && <p className="mt-2 text-muted">No categories loaded.</p>}
            </details>}
        </section>
        <div className="flex flex-col gap-2">
        {onChangePlan&&<Button sm className="!w-full !min-h-[34px] !py-[7px]" variant="secondary" disabled={busy} onClick={onChangePlan}>Change YNAB Plan</Button>}
        <Button sm className="!w-full !min-h-[34px] !py-[7px]" variant="secondary" disabled={busy} onClick={refresh}>Refresh budget categories</Button>
        <LinkButton sm className="!w-full !min-h-[34px] !py-[7px]" href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer">Manage YNAB Token</LinkButton>
        {/* Remains enabled during a pending category request. */}
        <Button sm className="!w-full !min-h-[34px] !py-[7px]" variant="danger" onClick={disconnect}>Disconnect YNAB</Button>
        </div>
        <DataPrivacyNotice />
        <LocalDataSection connected />
        <p className="text-[12.5px] text-faint">Disconnect removes this profile’s token. It does not revoke access at YNAB or erase cached learning data. To revoke token access at YNAB, open Manage YNAB Token and revoke the Personal Access Token there.</p>
      </div>
    </details>
    {refreshed && <StatusMessage kind="ok" role="status">Categories refreshed from YNAB.</StatusMessage>}
    {error && <StatusMessage kind="err" role="alert">{error}</StatusMessage>}
  </div>;
}
