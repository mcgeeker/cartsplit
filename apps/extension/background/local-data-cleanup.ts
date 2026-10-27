import { LocalDataError } from "@/lib/local-data-error";
import { getSettings } from "@/lib/settings";
import { captureLocalData, clearLocalDataIfUnchanged, type LocalDataSnapshot } from "@/lib/db";
import { CONNECTION_CHECK_ONLY } from "@/lib/verification";
import type { LocalDataDeletePreview } from "@/lib/types";

let revision = 0;
let pending: { id: string; expiresAt: number; revision: number; snapshot: LocalDataSnapshot } | null = null;

export function invalidateLocalDataPreview(id?: unknown) {
  if (id !== undefined && id !== pending?.id) return;
  revision += 1; pending = null;
}

async function requireDisconnected(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!CONNECTION_CHECK_ONLY) throw new LocalDataError("Local cleanup is currently available only in the verification build.");
  const settings = await getSettings();
  signal?.throwIfAborted();
  if (settings.accessToken || settings.planId || settings.planName) throw new LocalDataError("Disconnect YNAB before previewing local data removal.");
}

export async function previewLocalDataDelete(signal?: AbortSignal): Promise<LocalDataDeletePreview> {
  invalidateLocalDataPreview();
  const startedAt = revision;
  await requireDisconnected(signal);
  const snapshot = await captureLocalData(signal);
  signal?.throwIfAborted();
  if (revision !== startedAt) throw new LocalDataError("The connection changed. Preview local data removal again.");
  const id = crypto.randomUUID(); const expiresAt = Date.now() + 300000;
  pending = { id, expiresAt, revision, snapshot };
  return { approvalId: id, expiresAt, counts: { ...snapshot.counts } };
}

export async function deleteLocalData(id: unknown, confirmed: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (confirmed !== true) throw new LocalDataError("Confirm deletion of the displayed local records first.");
  const grant = pending;
  if (typeof id !== "string" || !grant || grant.id !== id || grant.expiresAt <= Date.now()) {
    throw new LocalDataError("The removal preview expired or was used. Preview local data removal again.");
  }
  pending = null;
  await requireDisconnected(signal);
  return clearLocalDataIfUnchanged(grant.snapshot, signal, () => {
    signal?.throwIfAborted();
    if (grant.revision !== revision || grant.expiresAt <= Date.now()) throw new LocalDataError("The removal preview was canceled or expired. Preview again.");
  });
}
