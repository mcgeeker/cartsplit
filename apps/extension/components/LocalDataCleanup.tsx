import {useRevealScroll} from "./useRevealScroll";
import { useEffect, useRef, useState } from "react";
import { Button, StatusMessage } from "@lineitem/ui";
import { previewLocalDataDelete, deleteLocalData, cancelLocalDataDelete } from "@/lib/messaging";
import type { LocalDataCounts, LocalDataDeletePreview } from "@/lib/types";

const labels: [keyof LocalDataCounts, string][] = [
  ["allocatedTransactions", "Cached orders"], ["learnedProducts", "Learned product choices"],
  ["productEmbeddings", "Product title records"], ["categories", "Cached categories"],
];

export default function LocalDataCleanup() {
  const [preview, setPreview] = useState<LocalDataDeletePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewStart=useRevealScroll<HTMLDivElement>(preview?.approvalId);
  const generation = useRef(0);
  const pendingId = useRef<string | null>(null);
  useEffect(() => () => {
    generation.current += 1;
    if (pendingId.current) void cancelLocalDataDelete(pendingId.current).catch(() => {});
  }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => { setExpired(true); setConfirmed(false); }, Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  function reset() {
    if (pendingId.current) void cancelLocalDataDelete(pendingId.current).catch(() => {});
    pendingId.current = null;
    generation.current += 1; setPreview(null); setConfirmed(false); setExpired(false); setError(null); setDone(false); setBusy(false);
  }
  async function show() {
    reset(); const current = generation.current; setBusy(true);
    try {
      const result = await previewLocalDataDelete();
      if (generation.current !== current) return;
      if (result.error || !result.preview) throw new Error(result.error || "Could not preview local data removal.");
      pendingId.current = result.preview.approvalId; setPreview(result.preview);
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "Could not preview local data removal."); }
    finally { if (generation.current === current) setBusy(false); }
  }
  async function remove() {
    if (!preview || !confirmed || expired || busy) return;
    const current = ++generation.current; const id = preview.approvalId;
    pendingId.current = null; setBusy(true); setConfirmed(false); setError(null);
    try {
      const result = await deleteLocalData(id, true);
      if (generation.current !== current) return;
      if (result.error || !result.ok || !result.counts || !labels.every(([key]) => result.counts![key] === 0)) {
        throw new Error(result.error || "Could not confirm removal. Preview the counts again.");
      }
      setPreview(null); setDone(true);
    } catch (e) {
      if (generation.current === current) { setExpired(true); setError(e instanceof Error ? e.message : "Could not confirm removal. Preview the counts again."); }
    } finally { if (generation.current === current) setBusy(false); }
  }
  const hasData = preview && labels.some(([key]) => preview.counts[key] > 0);
  return <section aria-label="Optional local data removal" className="flex flex-col gap-3 rounded-control border border-line p-3">
    <h2 className="text-[17px] font-semibold">Optional local data removal</h2>
    <p>Preview cached records for all budgets in this Firefox profile. Removing them cannot change YNAB transactions. The downloaded model and other Firefox profiles stay intact.</p>
    <Button variant="secondary" disabled={busy} onClick={show}>Preview local data removal</Button>
    {preview && <div ref={previewStart} className="scroll-mt-3 flex flex-col gap-2" role="status">
      {labels.map(([key, label]) => <p key={key}>{label}: {preview.counts[key]}</p>)}
      {!hasData && <p>No cached records to remove.</p>}
      {hasData && <>
        <p>This permanently removes these cached and learned records for every budget in this profile. It cannot be undone.</p>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy || expired}
          onChange={(event) => setConfirmed(event.target.checked)} /> I confirm deletion of the displayed local records for this Firefox profile.</label>
        <Button variant="danger" disabled={!confirmed || busy || expired} onClick={remove}>Delete these local records</Button>
      </>}
      <Button variant="secondary" disabled={busy} onClick={reset}>Cancel removal preview</Button>
      {expired && <p>This preview expired or was used. Preview the counts again.</p>}
    </div>}
    {done && <StatusMessage kind="ok" role="status">Local records removed. All four counts are zero. YNAB transactions and the downloaded model are unchanged.</StatusMessage>}
    {error && <StatusMessage kind="err" role="alert">{error}</StatusMessage>}
  </section>;
}
