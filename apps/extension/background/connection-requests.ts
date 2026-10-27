/** Tracks just the connection requests enabled by the current verification
 * stage. Cancellation takes effect immediately, before queued storage work. */
const active = new Set<AbortController>();
let disconnects = 0;

export async function withConnectionRequest<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (disconnects) throw new DOMException("Connection request canceled.", "AbortError");
  const controller = new AbortController();
  active.add(controller);
  try {
    return await run(controller.signal);
  } finally {
    active.delete(controller);
  }
}

export function cancelConnectionRequests(): () => void {
  disconnects += 1;
  for (const controller of active) controller.abort();
  let released = false;
  return () => {
    if (!released) { disconnects -= 1; released = true; }
  };
}
