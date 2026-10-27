import { useEffect, useState } from "react";
import ConnectionCheck from "@/components/ConnectionCheck";
import Onboarding from "@/components/Onboarding";
import { getSettings, type PlanInfo } from "@/lib/messaging";

/** The selected-order workflow is the only application route. Background
 * messages independently enforce this scope; changing UI state cannot enable
 * the retired queue, batch approval or backfill paths. */
export default function App() {
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  useEffect(() => {
    let active = true;
    getSettings().then(result => {
      if (active && result.hasToken && result.planId) {
        setPlan({ id: result.planId, name: result.planName ?? "" });
      }
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  if (!ready) return <div className="min-h-screen bg-bg p-4 text-text" role="status">Loading…</div>;
  if (!plan) return <Onboarding onComplete={setPlan} />;
  return <ConnectionCheck key={plan.id} plan={plan} onDisconnect={() => setPlan(null)} onChangePlan={() => setPlan(null)} />;
}
