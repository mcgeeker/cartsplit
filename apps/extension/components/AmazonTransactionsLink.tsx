import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@lineitem/ui";
const URL = "https://www.amazon.ca/cpe/yourpayments/transactions";
const isTransactions = (url: string) => {
  try { const parsed = new globalThis.URL(url); return parsed.origin === "https://www.amazon.ca" && /^\/cpe\/yourpayments\/transactions\/?$/.test(parsed.pathname); } catch { return false; }
};

export default function AmazonTransactionsLink() {
  const [missing, setMissing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const creating = useRef(false);
  useEffect(() => {
    let alive = true, revision = 0;
    const check = async (removedId?: number) => {
      const version = ++revision;
      try { const tabs = await browser.tabs.query({ currentWindow: true, url: URL + "*" });
        if (alive && version === revision) { setMissing(!tabs.some(tab => tab.id !== removedId && isTransactions(tab.url ?? ""))); setError(null); }
      } catch { if (alive && version === revision) setError("Could not check the Amazon Transactions tab. Keep one open in this window."); }
    };
    const changed = () => { void check(); };
    const removed = (id: number) => { void check(id); };
    const timer = setInterval(changed, 1000);
    browser.tabs.onCreated.addListener(changed); browser.tabs.onRemoved.addListener(removed); browser.tabs.onUpdated.addListener(changed);
    void check();
    return () => { alive = false; clearInterval(timer); browser.tabs.onCreated.removeListener(changed); browser.tabs.onRemoved.removeListener(removed); browser.tabs.onUpdated.removeListener(changed); };
  }, []);
  async function open() {
    if (creating.current) return;
    creating.current = true; setBusy(true); setError(null);
    try {
      const tabs = await browser.tabs.query({ currentWindow: true, url: URL + "*" });
      if (!tabs.some(tab => isTransactions(tab.url ?? ""))) await browser.tabs.create({ url: URL, active: true });
      setMissing(false);
    } catch { setError("Could not open Amazon Transactions. Try again."); }
    finally { creating.current = false; setBusy(false); }
  }
  return <>{missing && <><Button variant="secondary" disabled={busy} onClick={open}>Open Amazon Transactions/Payments</Button><p className="text-[13px] font-normal leading-relaxed text-muted">Keep the Amazon Transactions/Your Payments tab open in the same browser window as the order details page you’re reviewing.</p></>}{error && <p role="alert">{error}</p>}</>;
}
