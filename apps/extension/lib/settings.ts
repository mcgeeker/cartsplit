/** Connection data lives in the extension origin's IndexedDB. Content scripts
 * use the retailer page's origin for IndexedDB, so cannot read this store.
 * Do not move credentials to storage.local, which content scripts can read.
 * This is local profile storage, not encryption or an OS credential vault. */
export interface Settings {
  accessToken: string | null;
  planId: string | null;
  planName: string | null;
}

/** The only settings shape allowed in responses to extension UI. */
export interface PublicSettings {
  hasToken: boolean;
  planId: string | null;
  planName: string | null;
}

// This belongs to the new CartSplit add-on identity. Never discover or migrate
// another installation's credential store implicitly during the rename.
const DATABASE = "cartsplit-connection";
const STORE = "connection";
const KEY = "current";

function connection(update?: Partial<Settings> | null): Promise<Settings> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Could not access the local YNAB connection. Try reopening the sidebar."));
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = fail;
    open.onblocked = fail;
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, update === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore(STORE);
      const read = store.get(KEY);
      let value: Settings;
      read.onsuccess = () => {
        const source = update === null ? {} : { ...read.result, ...update };
        // Explicit projection ignores stale OAuth/unknown fields too.
        value = {
          accessToken: typeof source.accessToken === "string" ? source.accessToken : null,
          planId: typeof source.planId === "string" ? source.planId : null,
          planName: typeof source.planName === "string" ? source.planName : null,
        };
        if (update === null) store.delete(KEY);
        else if (update !== undefined) store.put(value, KEY);
      };
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onabort = () => { db.close(); fail(); };
      tx.onerror = () => { db.close(); fail(); };
    };
  });
}

/** Background-only use: never return this object over runtime messaging. */
export function getSettings(): Promise<Settings> {
  return connection();
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const { accessToken, planId, planName } = await getSettings();
  return { hasToken: Boolean(accessToken), planId, planName };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await connection(settings);
}

/** Removes this profile's connection; does not revoke the token at YNAB. */
export async function clearSettings(): Promise<void> {
  await connection(null);
}
