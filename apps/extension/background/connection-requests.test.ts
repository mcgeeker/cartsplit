import { describe, expect, it, vi } from "vitest";
import { cancelConnectionRequests, withConnectionRequest } from "./connection-requests";

describe("connection request cancellation", () => {
  it("aborts pending reads, blocks new reads while disconnecting, then admits a new session", async () => {
    let pendingSignal!: AbortSignal;
    const pending = withConnectionRequest((signal) => {
      pendingSignal = signal;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const resume = cancelConnectionRequests();
    expect(pendingSignal.aborted).toBe(true);
    const run = vi.fn();
    await expect(withConnectionRequest(run)).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
    await rejected;
    resume();
    await expect(withConnectionRequest(async (signal) => signal.aborted)).resolves.toBe(false);
  });

  it("keeps overlapping disconnects blocked until both complete", async () => {
    const resumeFirst = cancelConnectionRequests();
    const resumeSecond = cancelConnectionRequests();
    resumeFirst(); resumeFirst();
    await expect(withConnectionRequest(async () => true)).rejects.toMatchObject({ name: "AbortError" });
    resumeSecond();
    await expect(withConnectionRequest(async () => true)).resolves.toBe(true);
  });

  it("unregisters completed requests", async () => {
    let completedSignal!: AbortSignal;
    await withConnectionRequest(async (signal) => { completedSignal = signal; });
    const resume = cancelConnectionRequests();
    expect(completedSignal.aborted).toBe(false);
    resume();
  });
});
