/** The general financial workflow remains closed. Also used by the network
 * client; deleting this flag is not authorization to widen write capabilities. */
export const CONNECTION_CHECK_ONLY = true;

export const SIDEBAR_COMMANDS: ReadonlySet<string> = new Set(["APPLY_PURCHASE_APPROVAL", "CANCEL_LOCAL_DATA_DELETE", "CANCEL_PURCHASE_APPROVAL", "CLEAR_SETTINGS", "CONNECT_TOKEN", "DELETE_LOCAL_DATA", "GET_CATEGORIES", "GET_PLANS", "GET_PURCHASE_ORDER_SESSION", "GET_PURCHASE_REVIEW_TAB", "GET_SETTINGS", "PREPARE_PURCHASE_APPROVAL", "PREVIEW_LOCAL_DATA_DELETE", "REFRESH_CATEGORIES", "REOPEN_PURCHASE_REVIEW_TAB", "REVIEW_CA_PURCHASE", "SAVE_PLAN", "SUSPEND_PURCHASE_REVIEW"]);
export function connectionCommandAllowed(type: string): boolean {
  return SIDEBAR_COMMANDS.has(type);
}
export const CONNECTION_CHECK_MESSAGE = "Only selected-order review and explicitly approved changes in the selected YNAB plan are available.";
