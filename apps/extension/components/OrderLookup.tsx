import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { LookupView } from "@/lib/register-lookup";

export default function OrderLookup({ embedded = false }: { embedded?: boolean }) {
  const [lookup, setLookup] = useState<LookupView | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, waiting = false;
    const read = async () => {
      if (waiting) return; waiting = true;
      try { const result = await browser.runtime.sendMessage({ type: "LOOKUP_STATUS" }); if (alive) { if (result?.lookup) { setLookup(result.lookup); setStatusError(null); } else setStatusError("Could not read lookup status. Reload this tab to reconnect."); } }
      catch { if (alive) setStatusError("Could not read lookup status. Reload this tab to reconnect."); }
      finally { waiting = false; }
    };
    void read(); const timer = setInterval(() => void read(), 500);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function action(type: string, orderId?: string) {
    if (busy) return; setBusy(true); setError(null);
    try { const result = await browser.runtime.sendMessage({ type, ...(orderId ? { orderId } : {}) }); if (result?.error) setError(result.error); }
    catch { setError("Could not complete this lookup action. Start again from YNAB."); }
    finally { setBusy(false); }
  }
  if (embedded && !statusError && (!lookup || lookup.state === "idle" || lookup.dismissed)) return null;
  const Container = embedded ? "section" : "main", Heading = embedded ? "h2" : "h1";
  const button = "rounded-control border border-line-strong bg-surface px-3 py-2 font-semibold disabled:opacity-50";
  return <Container aria-label="Find Amazon order" className={embedded ? "space-y-3 rounded-control border border-line p-3 text-[13px] text-text" : "mx-auto max-w-2xl space-y-5 p-6 text-text"}>
    <Heading className={embedded ? "text-[17px] font-semibold" : "text-2xl font-bold"}>Find Amazon order</Heading>
    <p role="status">{lookup?.message ?? (statusError ? "Lookup status is unavailable." : "Checking lookup status…")}</p>
    {lookup && lookup.pages > 0 && <p>{lookup.pages} payment pages checked.</p>}
    {lookup?.state === "signin" && <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void action("LOOKUP_SIGNIN")}>Sign in to Amazon</button><button className={button} disabled={busy} onClick={() => void action("LOOKUP_CONTINUE")}>Resume</button></div>}
    {lookup?.state === "paused" && <button className={button} disabled={busy} onClick={() => void action("LOOKUP_CONTINUE")}>Continue</button>}
    {lookup?.state === "choices" && <ul className="space-y-3">{lookup.candidates.map(candidate => <li key={`${candidate.orderId}:${candidate.date}`} className="rounded-control border border-line p-3"><p>Amazon order {candidate.orderId}</p><p>{candidate.date} · CAD {(candidate.cents / 100).toFixed(2)}</p><button className={button} disabled={busy} onClick={() => void action("LOOKUP_OPEN", candidate.orderId)}>Open this order</button></li>)}</ul>}
    {lookup && ["searching", "paused", "signin", "choices"].includes(lookup.state) && <button className={button} disabled={busy} onClick={() => void action("LOOKUP_CANCEL")}>Cancel lookup</button>}
    {statusError && <p role="alert">{statusError}</p>}
    {error && <p role="alert">{error}</p>}
    <p className="text-muted">Lookup reads only. Choose Review selected order before preparing any changes.</p>
  </Container>;
}
