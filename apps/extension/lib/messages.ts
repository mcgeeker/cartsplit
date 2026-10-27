/** Shared, controlled user-facing failures. Never include API response bodies. */
export const NOT_CONNECTED = "Not connected to YNAB";
/** A Personal Access Token cannot be refreshed; replace it locally. */
export const YNAB_RECONNECT =
  "Your YNAB token is missing, invalid, or revoked. Disconnect and enter a valid Personal Access Token.";
