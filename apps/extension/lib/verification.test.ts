import { expect, it } from "vitest";
import { CONNECTION_CHECK_ONLY, connectionCommandAllowed, SIDEBAR_COMMANDS } from "./verification";
import * as ynab from "./ynab";
it("keeps selected-order scope and exposes no general or retired financial writer", () => {
  expect(CONNECTION_CHECK_ONLY).toBe(true);
  for (const name of ["updateTransaction", "getUnapprovedTransactions", "getTransactionsSince", "writeDummyTestSplit", "writeCanadianTestSplit"]) expect(ynab).not.toHaveProperty(name);
});
it.each(["SYNC", "START_BACKFILL", "OPEN_RETAILER", "APPROVE_TRANSACTION", "APPROVE_BATCH", "CHECK_MODEL", "APPLY_DUMMY_SPLIT", "APPLY_CA_TEST_SPLIT", "PAGE_RESULT", "unknown"])("denies retired request %s", command => {
  expect(connectionCommandAllowed(command)).toBe(false);
});
it("uses the same explicit command set at both boundaries", () => {
  expect(SIDEBAR_COMMANDS.size).toBe(18);
  for (const command of SIDEBAR_COMMANDS) expect(connectionCommandAllowed(command)).toBe(true);
});
