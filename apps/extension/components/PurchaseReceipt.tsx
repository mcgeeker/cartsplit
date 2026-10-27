import type {PurchaseOrderSession} from '@/lib/types';
import {useRevealScroll} from './useRevealScroll';
const cad=(n:number)=>`CAD ${(n/100).toFixed(2)}`;
export default function PurchaseReceipt({session,visible=true}:{session:PurchaseOrderSession;visible?:boolean}){
 const start=useRevealScroll<HTMLElement>(visible&&session.complete);
 return <section ref={start} aria-label={session.complete?'Saved order':'Saved payments'} className="scroll-mt-3 space-y-3 rounded-control border border-line p-3 text-[13px] leading-relaxed">
 <h2 className="text-[17px] font-semibold">{session.complete?'Saved to YNAB':'Saved payments'}</h2>
 {session.complete&&<p className="font-semibold">Order card total {cad(session.orderTotalCents)}</p>}
 {session.receipts.map((receipt,i)=><div key={`${receipt.date}:${receipt.totalCents}`} className={i?'space-y-2 border-t border-line pt-3':'space-y-2'}>
 {receipt.destination&&<p className="text-muted">{receipt.destination.planName} → {receipt.destination.accountName}</p>}
 <p className="flex flex-wrap justify-between gap-x-3 font-semibold"><span>{receipt.date}</span><span className="tabular-nums">{cad(receipt.totalCents)}</span></p>
 <dl className="space-y-1 text-muted">{receipt.lines.map((line,n)=><div key={n} className="flex flex-wrap justify-between gap-x-3"><dt>{line.categoryName}</dt><dd className="tabular-nums">{cad(line.cents)}</dd></div>)}</dl>
 {!receipt.learningSaved&&<p>Local category learning did not complete. Do not retry the save.</p>}
 </div>)}
 <p className="text-muted">{session.complete?'Changes saved; YNAB’s response matches. Select another Amazon order to continue.':'These payments are saved. Each remaining payment needs a separate review and approval.'}</p>
 <p className="text-muted">Receipt from this session. Inspect YNAB for any later changes.</p>
 </section>;
}
