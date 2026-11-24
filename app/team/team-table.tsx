"use client";

import { useEffect, useState, useMemo } from "react";
import AssessmentGrid from "./assessment-grid";
import ApiConnection from "../api-connection";
import RedmineLoading from "../redmine-loading";
import { PERIOD_START, PERIOD_END, validDate } from "@/lib/assessment";
import { useRedmineWorkspace } from "../use-redmine-workspace";
import { loadAssessmentRows, type AssessmentRow } from "./actions";

export default function TeamTable({ today }: { today: string }) {
  const state = useRedmineWorkspace(today);
  const { workspace, revision, start, end, pending, error } = state;
  const [rows, setRows] = useState<Record<number, AssessmentRow>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [draftStart, setDraftStart] = useState(PERIOD_START);
  const [draftEnd, setDraftEnd] = useState(end);
  const [refresh, setRefresh] = useState(0);
  const [batchError, setBatchError] = useState("");
  const peopleJson = JSON.stringify(state.people);
  const keysJson = JSON.stringify(
    (state.activeAccount ? [state.activeAccount] : []).map(({ id, key }) => ({
      id,
      key,
    })),
  );
  const activeId = state.activeAccount?.id || 0;

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const users = JSON.parse(peopleJson) as { id: number; name: string }[];
    const keys = JSON.parse(keysJson) as { id: number; key: string }[];
    async function run() {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setRows({});
      setBatchError("");
      try {
        for (let i = 0; i < users.length; i += 4) {
          if (cancelled) return;
          const batch = await loadAssessmentRows(
            users.slice(i, i + 4).map((u) => u.id),
            keys,
            activeId,
            start,
            end,
            refresh > 0,
          );
          if (cancelled) return;
          setRows((previous) => ({
            ...previous,
            ...Object.fromEntries(batch.map((row) => [row.id, row])),
          }));
        }
      } catch {
        if (!cancelled)
          setBatchError("โหลดบางรายการไม่สำเร็จ กรุณากดอัปเดตคะแนนอีกครั้ง");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeId, peopleJson, keysJson, revision, start, end, refresh]);

  const evaluating =
    loading ||
    (!!workspace &&
      Object.keys(rows).length < state.people.length &&
      !batchError);
  const data = useMemo(
    () =>
      !activeId
        ? []
        : (JSON.parse(peopleJson) as { id: number; name: string }[])
            .filter((p) =>
              p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )
            .map((person) => ({
              ...rows[person.id],
              ...person,
              invalidIds: rows[person.id]?.invalidIds || [],
            })),
    [activeId, peopleJson, rows, search],
  );

  return (
    <div className="team-content">
      <ApiConnection
        account={state.activeAccount}
        pending={pending}
        revision={revision}
        onConnect={(key) => state.connect(key, 0)}
        onDisconnect={state.signOut}
      />
      <form
        className="team-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !validDate(draftStart) ||
            !validDate(draftEnd) ||
            draftStart < PERIOD_START ||
            draftStart > draftEnd ||
            draftEnd > today ||
            draftEnd > PERIOD_END
          ) {
            state.setError("กรุณาระบุช่วงวันที่ให้ถูกต้อง");
            return;
          }
          state.selectPerson(state.userId, draftEnd, draftStart);
        }}
      >
        <label>
          ตั้งแต่วันที่
          <input
            type="date"
            min={PERIOD_START}
            max={draftEnd}
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            required
          />
        </label>
        <label>
          ถึงวันที่ (default วันนี้)
          <input
            type="date"
            min={draftStart}
            max={today < PERIOD_END ? today : PERIOD_END}
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            required
          />
        </label>
        <button
          className="primary-button"
          disabled={pending || evaluating || !workspace}
        >
          กรองวันที่
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={pending || evaluating || !workspace}
          onClick={() => setRefresh((n) => n + 1)}
        >
          อัปเดตคะแนน
        </button>
        <label className="team-search">
          ค้นหาชื่อ
          <input
            type="search"
            value={search}
            placeholder="พิมพ์ชื่อที่ต้องการค้นหา"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </form>
      {(error || batchError) && (
        <p className="error-banner" role="alert">
          {error || batchError}
        </p>
      )}
      {pending || evaluating ? <RedmineLoading detail={!pending ? `ประเมินแล้ว ${Object.keys(rows).length}/${state.people.length} คน` : undefined} /> : <p className="team-progress" role="status">
        {workspace
              ? `แสดง ${data.length} คน · รอบประเมิน ${start} ถึง ${end}`
              : "เชื่อมต่อบัญชีเพื่อเริ่มดูผลประเมิน"}
      </p>}
      <AssessmentGrid data={data} />
      <p className="help">
        คะแนนและสถิติใช้ช่วงวันที่เดียวกันกับหน้ารายบุคคล · Time Sheet
        คิดจากวันจันทร์–ศุกร์ · เลือกชื่อเพื่อดูผลประเมินฉบับเต็ม
      </p>
    </div>
  );
}
