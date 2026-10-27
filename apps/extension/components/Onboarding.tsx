import { useEffect, useRef, useState } from "react";
import { clearSettings, connectToken, getPlans, getSettings, savePlan, type PlanInfo } from "@/lib/messaging";
import { OnboardingView, type OnboardingPhase } from "./OnboardingView";

interface OnboardingProps {
  onComplete: (plan: PlanInfo) => void;
}

/** Token goes to the background once; only budget ids/names come back. */
export default function Onboarding({ onComplete }: OnboardingProps) {
  const [phase, setPhase] = useState<OnboardingPhase>("loading");
  const [hasToken, setHasToken] = useState(false);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(0);

  useEffect(() => {
    let active = true;
    async function resume() {
      try {
        const settings = await getSettings();
        if (!active) return;
        if (settings.error) throw new Error(settings.error);
        if (settings.hasToken) {
          setHasToken(true);
          const response = await getPlans();
          if (!active) return;
          if (response.error || !response.plans) throw new Error(response.error || "Could not load your budgets.");
          setPlans(response.plans);
          setPhase("picking");
        } else setPhase("connect");
      } catch {
        if (active) {
          setError("Could not restore your connection. Remove the local connection or reopen the sidebar to retry.");
          setPhase("error");
        }
      }
    }
    void resume();
    return () => { active = false; };
  }, []);

  async function handleConnect(token: string) {
    const current = ++operation.current;
    setError(null);
    setPhase("connecting");
    try {
      const response = await connectToken(token);
      if (current !== operation.current) return;
      if (response.error || !response.plans) throw new Error(response.error || "Could not validate your token.");
      setHasToken(true);
      setPlans(response.plans);
      setSelectedId("");
      setPhase("picking");
    } catch (e) {
      if (current !== operation.current) return;
      setError(e instanceof Error ? e.message : "Could not validate your token.");
      setPhase("error");
    }
  }

  async function handleSave() {
    const chosen = plans.find((p) => p.id === selectedId);
    if (!chosen) return;
    const current = ++operation.current;
    setError(null);
    setPhase("saving");
    try {
      const response = await savePlan(chosen.id, chosen.name);
      if (current !== operation.current) return;
      if (response.error) throw new Error(response.error);
      onComplete(chosen);
    } catch (e) {
      if (current !== operation.current) return;
      setError(e instanceof Error ? e.message : "Could not save your budget choice.");
      setPhase("error");
    }
  }

  async function handleReset() {
    operation.current += 1;
    setPhase("loading");
    setError(null);
    try {
      await clearSettings();
      setHasToken(false);
      setPlans([]);
      setSelectedId("");
      setPhase("connect");
    } catch {
      setError("Could not remove the local connection. Try again.");
      setPhase("error");
    }
  }

  return <OnboardingView phase={phase} hasToken={hasToken} plans={plans}
    selectedId={selectedId} error={error} onConnect={handleConnect}
    onSelect={setSelectedId} onSave={handleSave} onReset={handleReset} />;
}
