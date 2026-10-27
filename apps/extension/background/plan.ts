import { getCategories } from "@/lib/ynab";
import { saveSettings } from "@/lib/settings";
import { putCategories } from "@/lib/db";

/** Fetch first, then commit the plan-tagged cache before connection settings.
 * If cancellation/storage failure separates those commits, cached categories
 * are hidden from the old plan. Historical learning is preserved and never
 * adopted into another plan. Caller serializes this with connection changes. */
export async function switchPlan(planId: string, planName: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
  const categories = await getCategories(planId, opts.signal);
  opts.signal?.throwIfAborted();
  await putCategories(categories, opts.signal, planId);
  opts.signal?.throwIfAborted();
  await saveSettings({ planId, planName });
}
