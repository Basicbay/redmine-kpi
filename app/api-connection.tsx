"use client";
import { useState } from "react";

export default function ApiConnection({ account, pending, revision, onConnect, onDisconnect }: { account?: { id: number; name: string }; pending: boolean; revision: number; onConnect: (key: string) => void; onDisconnect: () => void }) {
  const [draft, setDraft] = useState("");
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const locked = !!account && editingRevision !== revision;
  if (locked) return <section className="api-connection api-connection-compact" aria-label="บัญชีที่ใช้เชื่อมต่อ Redmine" tabIndex={0}>
    <span className="connection-badge">เชื่อมต่อแล้ว · ล็อก key</span>
    <strong className="connected-account-owner">เจ้าของ key: {account.name}</strong>
    <span className="connection-key-mask" aria-label="API key ถูกซ่อนและจดจำไว้แล้ว">API key: ••••••••</span>
    <button type="button" className="secondary-button" disabled={pending} onClick={() => { setEditingRevision(revision); setDraft(""); }}>เปลี่ยน API key</button>
    <button type="button" className="secondary-button" disabled={pending} onClick={onDisconnect}>ลืม key และออกจากบัญชี</button>
  </section>;
  return <section className="api-connection" aria-labelledby="api-connection-heading">
    <div className="api-connection-heading"><div><h2 id="api-connection-heading">จัดการ access key / เชื่อมต่อบัญชี</h2>{!locked && <p>ใช้ API key บัญชีเดียวเพื่อดูทุกคนตามสิทธิ์</p>}</div>{locked && <span className="connection-badge">เชื่อมต่อแล้ว · ล็อก key</span>}</div>
    <form className="api-connection-controls" onSubmit={event => { event.preventDefault(); if (draft.trim()) { onConnect(draft.trim()); setDraft(""); } }}>
      <label htmlFor="primary-api-key">API key ของบัญชีที่ใช้ดูข้อมูล<input id="primary-api-key" type="password" autoComplete="off" maxLength={256} value={draft} disabled={pending} onChange={e => setDraft(e.target.value)} required placeholder="วาง API key เพื่อเชื่อมต่อ" /></label>
      <button className="primary-button" disabled={pending || !draft.trim()}>{pending ? "กำลังตรวจสอบ…" : "เชื่อมต่อและจำ key"}</button>
      {account && <button type="button" className="secondary-button" disabled={pending} onClick={() => { setEditingRevision(null); setDraft(""); }}>ยกเลิก</button>}
    </form>
  </section>;
}
