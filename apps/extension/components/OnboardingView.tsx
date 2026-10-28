import DataPrivacyNotice from "./DataPrivacyNotice";
import { CONNECTION_CHECK_ONLY } from "@/lib/verification";
import LocalDataSection from "./LocalDataSection";
import { useState, type ReactNode } from "react";
import { Button, StatusMessage, Spinner, Icon } from "@lineitem/ui";
import type { PlanInfo } from "@/lib/messaging";

export type OnboardingPhase = "loading" | "connect" | "connecting" | "picking" | "saving" | "error";

interface OnboardingViewProps {
  verificationControls?: ReactNode;
  phase: OnboardingPhase;
  hasToken?: boolean;
  plans?: PlanInfo[];
  selectedId?: string;
  error?: string | null;
  onConnect: (token: string) => void;
  onSelect?: (id: string) => void;
  onSave?: () => void;
  onReset?: () => void;
}

export function OnboardingView({ phase, hasToken = false, plans = [], selectedId = "", error,
  onConnect, onSelect, onSave, onReset, verificationControls }: OnboardingViewProps) {
  const [token, setToken] = useState("");
  const busy = phase === "loading" || phase === "connecting" || phase === "saving";

  return (
    <div className="flex min-h-screen flex-col gap-[18px] bg-bg p-4 pt-5 text-text">
      {CONNECTION_CHECK_ONLY && <p role="status" className="text-[14px] font-semibold">Amazon.ca workspace · choose the YNAB plan you want to categorize.</p>}
      {verificationControls}
      <p className="m-0 text-[14px] leading-[1.55] text-muted">
        Connect directly to YNAB with your Personal Access Token, then choose a budget.
        Your token is stored locally in this Firefox profile and sent only to YNAB.
      </p>
      <DataPrivacyNotice />
      {!hasToken && (phase === "connect" || phase === "error") && (
        <form className="flex flex-col gap-3" onSubmit={(event) => {
          event.preventDefault();
          const submitted = token;
          // Clear before the next render can detach this password input.
          const input = event.currentTarget.querySelector("input");
          if (input) input.value = "";
          setToken("");
          onConnect(submitted);
        }}>
          <label htmlFor="personal-token" className="text-[14px] font-semibold">Personal Access Token</label>
          <input id="personal-token" type="password" autoComplete="off" spellCheck={false}
            autoCapitalize="none" value={token} onChange={(event) => setToken(event.target.value)}
            className="rounded-control border border-line bg-surface p-2 text-text" required />
          <Button variant="primary" type="submit" disabled={!token.trim()}>Validate token</Button>
        </form>
      )}
      {hasToken && (phase === "picking" || phase === "error") && (
        <div className="flex flex-col gap-3">
          <label htmlFor="budget-choice" className="text-[14px] font-semibold">Choose a YNAB budget</label>
          <select id="budget-choice" value={selectedId} onChange={(event) => onSelect?.(event.target.value)}
            className="rounded-control border border-line bg-surface p-2 text-text">
            <option value="" disabled>Select a budget…</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <Button variant="primary" disabled={!plans.some((p) => p.id === selectedId)} onClick={onSave}>
            Use selected budget
          </Button>
          {!plans.length && <p role="status">No budgets are available. Remove the local connection to try another token.</p>}
        </div>
      )}
      {busy && <StatusMessage kind="muted" role="status"><Spinner size={16} />
        {phase === "loading" ? "Loading connection…" : phase === "connecting" ? "Validating with YNAB…" : "Loading budget categories…"}
      </StatusMessage>}
      {phase === "error" && error && <StatusMessage kind="err" role="alert"><Icon.alertCircle aria-hidden /> {error}</StatusMessage>}
      {!busy && (hasToken || phase === "error") && <Button variant="ghost" onClick={onReset}>Remove local connection</Button>}
      {!busy && !hasToken && <LocalDataSection />}
      {(phase === "connecting" || phase === "saving") && <Button variant="ghost" onClick={onReset}>Cancel connection request</Button>}
      <p className="m-0 text-[12.5px] text-faint">
        CartSplit matches CAD purchases in the plan you select. Every save needs your approval. Selecting a budget does not limit the token’s access to other budgets.
        Removing the local connection does not revoke the token at YNAB.
      </p>
    </div>
  );
}
