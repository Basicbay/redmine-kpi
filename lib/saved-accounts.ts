export const ACCOUNTS_STORAGE = "redmine.accounts";
export const LEGACY_KEY_STORAGE = "redmine.accessKey";
export type SavedAccount = { id: number; name: string; key: string; status: "connected" | "invalid"; connectedAt: string };
export type AccountStore = { version: 1; activeUserId: number | null; accounts: Record<string, SavedAccount> };
export const emptyAccounts = (): AccountStore => ({ version: 1, activeUserId: null, accounts: {} });

export function parseAccounts(raw: string | null): AccountStore {
  const result = emptyAccounts();
  try {
    const value = JSON.parse(raw || "null");
    if (value?.version !== 1 || !value.accounts || typeof value.accounts !== "object") return result;
    for (const account of Object.values(value.accounts) as SavedAccount[]) {
      if (!account || !Number.isSafeInteger(account.id) || account.id <= 0 || typeof account.name !== "string" || typeof account.key !== "string" || !account.key.trim() || account.key.length > 256) continue;
      result.accounts[String(account.id)] = { id: account.id, name: account.name, key: account.key.trim(), status: account.status === "invalid" ? "invalid" : "connected", connectedAt: typeof account.connectedAt === "string" ? account.connectedAt : "" };
    }
    if (Number.isSafeInteger(value.activeUserId) && result.accounts[String(value.activeUserId)]) result.activeUserId = value.activeUserId;
  } catch { /* Corrupt browser storage must not prevent manual connection. */ }
  return result;
}
