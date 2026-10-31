import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { revealExpandedContent } from "./useRevealScroll";

/** Preview guidance on hover/focus; click to keep it in the document flow. */
export default function InfoDisclosure({ label, children, heading }: { label: string; children: ReactNode; heading?: ReactNode }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false), [preview, setPreview] = useState(false);
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(expanded)revealExpandedContent(container.current);},[expanded]);
  return <div ref={container} className="relative text-[13px] font-normal leading-relaxed text-muted"
    onMouseLeave={() => setPreview(false)}
    onKeyDown={event => { if (event.key === "Escape") { setPreview(false); setExpanded(false); } }}>
    <div className="flex items-center gap-2">{heading}
    <button type="button" aria-label={`${label} information`} aria-expanded={expanded} aria-controls={id}
      aria-describedby={!expanded && preview ? `${id}-preview` : undefined}
      onMouseEnter={() => setPreview(true)} onFocus={() => setPreview(true)} onBlur={() => setPreview(false)}
      onClick={() => { setExpanded(value => !value); setPreview(false); }}
      className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="8"/><path d="M10 9v5"/><circle cx="10" cy="6" r="0.8" fill="currentColor" stroke="none"/></svg>
    </button></div>
    {!expanded && preview && <div id={`${id}-preview`} role="tooltip" className="absolute inset-x-0 top-full z-30 pt-1">
      <div className="max-h-[60vh] overflow-y-auto rounded-control border border-line-strong bg-surface p-3 shadow-lg">{children}</div>
    </div>}
    <div id={id} hidden={!expanded} className="mt-1 space-y-2">{children}</div>
  </div>;
}
