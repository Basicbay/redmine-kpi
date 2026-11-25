"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PERIOD_START, PERIOD_END } from "@/lib/assessment";
import { ACCOUNTS_STORAGE, LEGACY_KEY_STORAGE, emptyAccounts, parseAccounts, type AccountStore, type SavedAccount } from "@/lib/saved-accounts";
import { loadPerson, loadWorkspace } from "./actions";

type Connected = NonNullable<Awaited<ReturnType<typeof loadWorkspace>>["data"]>;
type Directory = Connected["directory"];
type View = Omit<Connected, "access"> & { userId: number; access: { owner: { id: number; name: string }; mode: "own" | "limited" } };
type Source = { account: SavedAccount; directory: Directory };
const viewKey = (key: string, id: number, start: string, end: string) => JSON.stringify([key, id, start, end]);

export function useRedmineWorkspace(today: string) {
  const queryClient = useQueryClient();
  const initialEnd = today > PERIOD_END ? PERIOD_END : today;
  const [workspace, setWorkspace] = useState<View>();
  const [directory, setDirectory] = useState<Directory>();
  const [catalog, setCatalog] = useState<{ id: number; name: string }[]>([]);
  const [store, setStore] = useState<AccountStore>(emptyAccounts);
  const storeRef = useRef<AccountStore>(emptyAccounts());
  const source = useRef<Source | null>(null);
  const epoch = useRef(0);
  const [userId, setUserId] = useState(0);
  const [start, setStart] = useState(PERIOD_START);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [pending, startTransition] = useTransition();
  const [revision, setRevision] = useState(0);
  const [permissions, setPermissions] = useState<Record<number, "allowed" | "denied">>({});

  const saveStore = useCallback((next: AccountStore, persist = true) => {
    storeRef.current = next;
    setStore(next);
    if (persist) {
      try { localStorage.setItem(ACCOUNTS_STORAGE, JSON.stringify(next)); localStorage.removeItem(LEGACY_KEY_STORAGE); }
      catch { setError("เชื่อมต่อได้ แต่เบราว์เซอร์ไม่อนุญาตให้จดจำ key"); }
    }
  }, []);

  const remember = useCallback((owner: { id: number; name: string }, key: string): SavedAccount => {
    const account: SavedAccount = { ...owner, key, status: "connected", connectedAt: new Date().toISOString() };
    saveStore({ version: 1, activeUserId: owner.id, accounts: { [owner.id]: account } });
    return account;
  }, [saveStore]);

  const markInvalid = useCallback((id: number) => {
    const old = storeRef.current.accounts[id];
    if (old) saveStore({ ...storeRef.current, accounts: { ...storeRef.current.accounts, [id]: { ...old, status: "invalid" } } });
    queryClient.removeQueries({ queryKey: ["redmine-view"] });
    if (source.current?.account.id === id) source.current = null;
  }, [queryClient, saveStore]);

  const applyView = useCallback((view: View, key: string, cached = false) => {
    setWorkspace(view); setDirectory(view.directory); setUserId(view.userId);
    setPermissions(previous => ({ ...previous, [view.userId]: "allowed" }));
    setStart(view.start); setEnd(view.end); setFromCache(cached); setRevision(value => value + 1);
    setCatalog(previous => {
      const people = new Map(previous.map(person => [person.id, person]));
      for (const person of view.directory.users) people.set(person.id, person);
      return [...people.values()];
    });
    if (!cached) {
      queryClient.setQueryData(["redmine-view", key, view.userId, view.start, view.end], view);
    }
  }, [queryClient]);

  useEffect(() => {
    const ticket = ++epoch.current;
    let active = true;
    startTransition(async () => {
      let saved = emptyAccounts();
      let legacy = "";
      try { saved = parseAccounts(localStorage.getItem(ACCOUNTS_STORAGE)); legacy = localStorage.getItem(LEGACY_KEY_STORAGE)?.trim() || ""; }
      catch { return; }
      await Promise.resolve();
      if (!active || ticket !== epoch.current) return;
      saveStore(saved, false);
      const accounts = Object.values(saved.accounts).filter(account => account.status === "connected");
      accounts.sort((a, b) => a.id === saved.activeUserId ? -1 : b.id === saved.activeUserId ? 1 : 0);
      const candidates = accounts.map(account => ({ key: account.key, id: account.id }));
      if (!candidates.length && legacy) candidates.push({ key: legacy, id: 0 });
      for (const candidate of candidates.slice(0, 1)) {
        try {
          const requested = window.location.pathname === "/person" ? Number(new URLSearchParams(window.location.search).get("user")) : 0;
          const targetUserId = Number.isSafeInteger(requested) && requested > 0 ? requested : candidate.id;
          
          const cached = targetUserId ? queryClient.getQueryData<View>(["redmine-view", candidate.key, targetUserId, PERIOD_START, initialEnd]) : null;
          if (cached) {
            setError("");
            const account = candidate.id ? saved.accounts[candidate.id] || remember(cached.directory.current, candidate.key) : remember(cached.directory.current, candidate.key);
            source.current = { account, directory: cached.directory };
            applyView(cached, candidate.key, true);
            return;
          }

          const result = await loadWorkspace(candidate.key, initialEnd, PERIOD_START, candidate.id || undefined);
          if (!active || ticket !== epoch.current) return;
          if (result.data) {
            setError("");
            const account = remember(result.data.directory.current, candidate.key);
            source.current = { account, directory: result.data.directory };
            if (Number.isSafeInteger(requested) && requested > 0 && requested !== account.id) {
              const reader = account;
              const target = await loadPerson(reader.key, requested, initialEnd, PERIOD_START, reader.id);
              if (!active || ticket !== epoch.current) return;
              if (target.data && target.access) {
                applyView({ ...result.data, person: target.data, userId: requested, access: target.access }, reader.key);
                return;
              }
              if (target.error?.includes("HTTP 403") && !target.invalidKey) setPermissions(previous => ({ ...previous, [requested]: "denied" }));
              setError(target.error || "อ่านข้อมูลบุคคลที่เลือกไม่สำเร็จ");
            }
            applyView({ ...result.data, userId: account.id }, candidate.key);
            return;
          }
          setError(result.error || "เชื่อมต่อบัญชีที่จดจำไว้ไม่สำเร็จ");
          if (result.invalidKey) {
            if (candidate.id) markInvalid(candidate.id);
            else { try { localStorage.removeItem(LEGACY_KEY_STORAGE); } catch { /* Storage may be blocked. */ } }
          } else break;
        } catch { if (active) setError("เชื่อมต่อบัญชีที่จดจำไว้ไม่สำเร็จ กรุณาลองใหม่"); break; }
      }
    });
    return () => { active = false; };
  }, [applyView, initialEnd, markInvalid, queryClient, remember, saveStore]);

  function connect(key: string, expectedId = userId) {
    const ticket = ++epoch.current;
    const expected = expectedId || undefined;
    startTransition(async () => {
      setError("");
      try {
        const refreshExisting = Object.values(storeRef.current.accounts).some(account => account.key === key);
        const result = await loadWorkspace(key, end, start, expected, refreshExisting);
        if (ticket !== epoch.current) return;
        if (!result.data) { setError(result.error || "เชื่อมต่อไม่สำเร็จ"); return; }
        setPermissions({});
        setCatalog([]);
        const account = remember(result.data.directory.current, key);
        source.current = { account, directory: result.data.directory };
        applyView({ ...result.data, userId: account.id }, key);
      } catch { if (ticket === epoch.current) setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    });
  }

  function selectPerson(id: number, nextEnd = end, nextStart = start, fresh = false) {
    const ticket = ++epoch.current;
    setUserId(id); setError("");
    const preferred = source.current?.account.status === "connected" ? source.current.account : Object.values(storeRef.current.accounts).find(account => account.status === "connected");
    if (!preferred) { setWorkspace(undefined); setError("กรุณาเชื่อมต่อ API key อย่างน้อยหนึ่งบัญชีก่อนดูข้อมูล"); return; }
    
    const cached = !fresh ? queryClient.getQueryData<View>(["redmine-view", preferred.key, id, nextStart, nextEnd]) : null;
    if (cached) {
      source.current = { account: preferred, directory: cached.directory };
      saveStore({ ...storeRef.current, activeUserId: preferred.id });
      applyView(cached, preferred.key, true);
      return;
    }
    setWorkspace(undefined);
    startTransition(async () => {
      try {
        if (preferred.id === id) {
          const result = await loadWorkspace(preferred.key, nextEnd, nextStart, id, fresh);
          if (ticket !== epoch.current) return;
          if (result.data) {
            const account = remember(result.data.directory.current, preferred.key);
            source.current = { account, directory: result.data.directory };
            applyView({ ...result.data, userId: id }, preferred.key);
            return;
          }
          if (!result.invalidKey) { setError(result.error || "อ่านข้อมูลไม่สำเร็จ"); return; }
          markInvalid(preferred.id);
        }
        let fallback = preferred.id !== id ? preferred : source.current?.account;
        if (!fallback || storeRef.current.accounts[fallback.id]?.status !== "connected") fallback = Object.values(storeRef.current.accounts).find(account => account.status === "connected");
        if (!fallback) { setError("API key ของบัญชีที่เชื่อมต่อใช้ไม่ได้ กรุณาเปลี่ยน API key"); return; }
        let context = source.current?.account.id === fallback.id ? source.current.directory : undefined;
        if (!context) {
          const boot = await loadWorkspace(fallback.key, nextEnd, nextStart, fallback.id, fresh);
          if (ticket !== epoch.current) return;
          if (!boot.data) { if (boot.invalidKey) markInvalid(fallback.id); setError(boot.error || "เชื่อมต่อไม่ได้"); return; }
          context = boot.data.directory;
        }
        const result = await loadPerson(fallback.key, id, nextEnd, nextStart, fallback.id, fresh);
        if (ticket !== epoch.current) return;
        if (!result.data || !result.access) {
          if (result.invalidKey) markInvalid(fallback.id);
          if (result.error?.includes("HTTP 403") && !result.invalidKey) setPermissions(previous => ({ ...previous, [id]: "denied" }));
          setError(result.error || "ไม่สามารถดูรายชื่อนี้ตามสิทธิ์ของบัญชีที่เชื่อมต่อ");
          return;
        }
        source.current = { account: fallback, directory: context };
        saveStore({ ...storeRef.current, activeUserId: fallback.id });
        applyView({ directory: context, person: result.data, access: result.access, userId: id, start: nextStart, end: nextEnd }, fallback.key);
      } catch { if (ticket === epoch.current) setError("อ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่"); }
    });
  }

  function forgetAccount(id: number) {
    const accounts = { ...storeRef.current.accounts };
    delete accounts[id];
    saveStore({ version: 1, activeUserId: storeRef.current.activeUserId === id ? null : storeRef.current.activeUserId, accounts });
    queryClient.removeQueries({ queryKey: ["redmine-view"] });
    if (source.current?.account.id === id) { ++epoch.current; source.current = null; setWorkspace(undefined); }
  }

  function signOut() {
    ++epoch.current; source.current = null; queryClient.clear();
    setWorkspace(undefined); setDirectory(undefined); setCatalog([]); setPermissions({}); setUserId(0); setError("");
    saveStore(emptyAccounts(), false);
    try { localStorage.removeItem(ACCOUNTS_STORAGE); localStorage.removeItem(LEGACY_KEY_STORAGE); }
    catch { setError("ออกจากบัญชีแล้ว แต่ลบ key ที่จดจำไว้ไม่สำเร็จ"); }
  }

  function beginNewAccount() {
    ++epoch.current; setUserId(0); setWorkspace(undefined); setError("");
  }

  const people = new Map(catalog.map(person => [person.id, person]));
  for (const account of Object.values(store.accounts)) people.set(account.id, { id: account.id, name: account.name });
  const connectedAccount = store.activeUserId === null ? undefined : store.accounts[store.activeUserId];
  const activeAccount = revision > 0 && connectedAccount?.status === "connected" ? connectedAccount : undefined;
  return { activeAccount, permissions, workspace, directory, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "th")), accounts: store.accounts, userId, start, end, error, setError, fromCache, pending, revision, connect, selectPerson, forgetAccount, signOut, beginNewAccount };
}
