import { getSettings } from "./settings";
import { YNAB_RECONNECT } from "./messages";

export class NeedsReauthError extends Error {
  constructor() {
    super(YNAB_RECONNECT);
  }
}

/** Personal tokens are used directly. There is no expiry timer or refresh. */
export async function getValidAccessToken(): Promise<string> {
  const { accessToken } = await getSettings();
  if (!accessToken) throw new NeedsReauthError();
  return accessToken;
}
