import { memoLength, MEMO_LIMIT } from "@/lib/purchase-memos";
import { scrollExpandedDetails } from "./useRevealScroll";

export default function MemoEditor({ label, value, disabled, onChange, collapsible = false }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; collapsible?: boolean }) {
  const length = memoLength(value), invalid = length > MEMO_LIMIT;
  const editor = <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold">
    <span className={collapsible ? "sr-only" : undefined}>{label}</span>
    <textarea aria-label={label} aria-invalid={invalid} rows={3} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" />
    <span className="font-normal text-muted">{length}/{MEMO_LIMIT} characters{invalid ? " — shorten this memo before preparing." : ""}</span>
  </label>;
  return collapsible ? <details onToggle={scrollExpandedDetails} className="min-w-0 scroll-mt-3 text-[13px]">
    <summary className="cursor-pointer font-semibold">{label}{invalid ? " — over 500 characters" : ""}</summary>
    <div className="mt-2">{editor}</div>
  </details> : editor;
}
