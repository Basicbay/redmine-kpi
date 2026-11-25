"use client";

import { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AssessmentGrid from "./assessment-grid";
import ApiConnection from "../api-connection";
import RedmineLoading from "../redmine-loading";
import { PERIOD_START, PERIOD_END, validDate } from "@/lib/assessment";
import { useRedmineWorkspace } from "../use-redmine-workspace";
import { loadAssessmentRows, type AssessmentRow } from "./actions";

export default function TeamTable({
  today,
  sharedWorkspace,
  onSelectPerson,
}: {
  today: string;
  sharedWorkspace?: ReturnType<typeof useRedmineWorkspace>;
  onSelectPerson?: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const internalState = useRedmineWorkspace(today);
  const state = sharedWorkspace || internalState;
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
    const cacheKey = ["assessment-rows", activeId, start, end];

    // Check TanStack Query cache if not refreshing
    if (refresh === 0) {
      const cached = queryClient.getQueryData<Record<number, AssessmentRow>>(cacheKey);
      if (cached && Object.keys(cached).length >= users.length && users.length > 0) {
        setRows(cached);
        setLoading(false);
        return;
      }
    }

    async function run() {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setRows({});
      setBatchError("");
      try {
        let accumulated: Record<number, AssessmentRow> = {};
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
          accumulated = {
            ...accumulated,
            ...Object.fromEntries(batch.map((row) => [row.id, row])),
          };
          setRows((previous) => ({
            ...previous,
            ...Object.fromEntries(batch.map((row) => [row.id, row])),
          }));
        }
        if (!cancelled && Object.keys(accumulated).length > 0) {
          queryClient.setQueryData(cacheKey, accumulated);
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
  }, [activeId, peopleJson, keysJson, revision, start, end, refresh, queryClient]);

  const evaluating =
    loading ||
    (!!workspace &&
      Object.keys(rows).length < state.people.length &&
      !batchError);

  const teamSummary = useMemo(() => {
    const validRows = Object.values(rows).filter((r) => r && r.stats);
    if (!validRows.length) return null;

    // Time sheet logged average: sum of loggedDays / sum of workdays
    const totalWorkdays = validRows.reduce(
      (sum, r) => sum + (r.stats?.workdays || 0),
      0,
    );
    const totalLoggedDays = validRows.reduce(
      (sum, r) => sum + (r.stats?.loggedDays || 0),
      0,
    );
    const avgLoggedPercent =
      totalWorkdays > 0
        ? Math.round((totalLoggedDays / totalWorkdays) * 100)
        : null;

    // On-time average: sum of onTimeCount / sum of dueTasks
    const totalDueTasks = validRows.reduce(
      (sum, r) => sum + (r.stats?.dueTasks || 0),
      0,
    );
    const totalOnTimeCount = validRows.reduce(
      (sum, r) => sum + (r.stats?.onTimeCount || 0),
      0,
    );
    const avgOnTimePercent =
      totalDueTasks > 0
        ? Math.round((totalOnTimeCount / totalDueTasks) * 100)
        : null;

    // Planning average: sum of planned / sum of newTasks
    const totalNewTasks = validRows.reduce(
      (sum, r) => sum + (r.stats?.newTasks || 0),
      0,
    );
    const totalPlanned = validRows.reduce(
      (sum, r) => sum + (r.stats?.planned || 0),
      0,
    );
    const avgPlanningPercent =
      totalNewTasks > 0
        ? Math.round((totalPlanned / totalNewTasks) * 100)
        : null;

    return {
      avgLoggedPercent,
      avgOnTimePercent,
      avgPlanningPercent,
    };
  }, [rows]);

  const loadingPercent = useMemo(() => {
    if (pending) return undefined;
    if (!evaluating) return undefined;
    const total = state.people.length;
    if (total === 0) return 0;
    const loaded = Object.keys(rows).length;
    return Math.min(100, Math.round((loaded / total) * 100));
  }, [pending, evaluating, state.people.length, rows]);

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
            }))
            .sort((a, b) => (b.total ?? -1) - (a.total ?? -1)),
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
      {pending || evaluating ? (
        <RedmineLoading
          percent={loadingPercent}
          detail={
            !pending
              ? `ประเมินแล้ว ${Object.keys(rows).length}/${state.people.length} คน`
              : undefined
          }
        />
      ) : (
        <p className="team-progress" role="status">
          {workspace
            ? `แสดง ${data.length} คน · รอบประเมิน ${start} ถึง ${end}`
            : "เชื่อมต่อบัญชีเพื่อเริ่มดูผลประเมิน"}
        </p>
      )}
      {teamSummary && (
        <div className="team-summary-cards" aria-label="สรุปตัวชี้วัดสำคัญของทีม">
          <div className="team-summary-card">
            <span className="team-summary-label">ลง Time Sheet ครบตามวันทำงาน</span>
            <div className="team-summary-value">
              <span>{teamSummary.avgLoggedPercent != null ? `เฉลี่ย ${teamSummary.avgLoggedPercent}%` : "—"}</span>
            </div>
            <span className="team-summary-desc">สัดส่วนวันที่มีการบันทึกเวลาทำงานเทียบกับวันทำงานทั้งหมด</span>
          </div>
          <div className="team-summary-card">
            <span className="team-summary-label">ส่งงานทันกำหนด</span>
            <div className="team-summary-value">
              <span>{teamSummary.avgOnTimePercent != null ? `${teamSummary.avgOnTimePercent}%` : "—"}</span>
              <span className="team-summary-target">(เป้าหมาย 85%)</span>
            </div>
            <span className="team-summary-desc">งานที่แล้วเสร็จภายใน Due date จากงานที่ครบกำหนดทั้งหมด</span>
          </div>
          <div className="team-summary-card">
            <span className="team-summary-label">งานที่วางแผนครบ</span>
            <div className="team-summary-value">
              <span>{teamSummary.avgPlanningPercent != null ? `เพียง ${teamSummary.avgPlanningPercent}%` : "—"}</span>
              <span className="team-summary-target">(เป้าหมาย 100%)</span>
            </div>
            <span className="team-summary-desc">มีทั้ง Due date และ Estimated time ในงานใหม่ที่ได้รับมอบหมาย</span>
          </div>
        </div>
      )}
      <AssessmentGrid data={data} onSelectPerson={onSelectPerson} />
      <p className="help">
        คะแนนและสถิติใช้ช่วงวันที่เดียวกันกับหน้ารายบุคคล · Time Sheet
        คิดจากวันจันทร์–ศุกร์ · เลือกชื่อเพื่อดูผลประเมินฉบับเต็ม
      </p>
    </div>
  );
}
