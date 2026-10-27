import { getPlans } from "@/lib/ynab";
import { getSettings, saveSettings } from "@/lib/settings";

/** Controlled validation text safe to return to the sidebar. */
export class ConnectionInputError extends Error {}

/** Validate with a direct, read-only YNAB request before persisting anything.
 * The caller serializes this with SAVE_PLAN and CLEAR_SETTINGS. */
export async function connectPersonalToken(input: unknown, signal?: AbortSignal) {
  if (typeof input !== "string") throw new ConnectionInputError("Enter a Personal Access Token.");
  const token = input.trim();
  if (!token || token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token)) {
    throw new ConnectionInputError("Enter a Personal Access Token without spaces or line breaks.");
  }
  if ((await getSettings()).accessToken) {
    throw new ConnectionInputError("Remove the local connection before entering another token.");
  }
  signal?.throwIfAborted();
  const plans = await getPlans(token, signal);
  signal?.throwIfAborted();
  if (!plans.length) throw new ConnectionInputError("This token has no available YNAB budgets. No token was saved.");
  await saveSettings({ accessToken: token, planId: null, planName: null });
  return { plans };
}

/** Recheck membership and use YNAB's name, rather than trusting UI fields. */
export async function resolveSelectedPlan(planId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const plans = await getPlans(undefined, signal);
  signal?.throwIfAborted();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new ConnectionInputError("Choose an available YNAB budget from the list.");
  return plan;
}
