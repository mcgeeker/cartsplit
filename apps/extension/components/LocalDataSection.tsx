import {revealExpandedContent} from "./useRevealScroll";
import { useEffect, useRef, useState } from "react";
import { Button } from "@lineitem/ui";
import LocalDataCleanup from "./LocalDataCleanup";

/** Cleanup stays unmounted until deliberately opened while disconnected. */
export default function LocalDataSection({ connected = false }: { connected?: boolean }) {
  const [open, setOpen] = useState(false);
  const section=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(open)revealExpandedContent(section.current);},[open]);
  return <details ref={section} className="scroll-mt-3 rounded-control border border-line p-3" onToggle={event => {if(event.target!==event.currentTarget)return;setOpen(event.currentTarget.open);}}>
    <summary className="cursor-pointer font-semibold">Local data</summary>
    {open && <div className="mt-2 flex flex-col gap-2 text-[13px]">
      <p className="font-semibold">Product-category learning</p>
      <p>After a verified purchase-review save, CartSplit remembers product/category choices locally for that YNAB Plan. Suggestions use exact saved choices, similar confirmed products, then local model comparison with category/group names. Weak or ambiguous matches stay manual. Product vectors are stored locally (up to 50 per category and 500 per Plan); raw titles are not stored by this feature. The existing model downloads on first use; product/category text is processed locally without a cloud AI account. Cached categories and older local records can also remain in this Firefox profile.</p>
      {connected ? <>
        <p>Disconnect YNAB first, then open Local data on the connection screen to preview removal. Disconnect alone does not erase records.</p>
        <Button sm className="!w-full !min-h-[34px] !py-[7px]" disabled>Preview local data removal</Button>
      </> : <LocalDataCleanup />}
    </div>}
  </details>;
}
