"use server";

import { assess } from "@/lib/assessment";
import { loadPerson } from "../actions";

export type AssessmentRow = {
  id: number; level?: string | null; total?: number; performance?: number; discipline?: number;
  metrics?: { id: string; title: string; score: number | null; max: number; provisional?: boolean }[];
  stats?: { workload: number; onTime: number | null; onTimeCount: number; dueTasks: number; late: number; pending: number; hours: number | null; overdue: number; maxOverdueDays: number; planning: number | null; planned: number; newTasks: number; loggedPercent: number | null; loggedDays: number | null; workdays: number; missingDays: number | null; fullDays: number | null; fullPercent: number | null; stale: number };
  mode?: "own" | "limited"; owner?: string; preliminary?: boolean; error?: string; invalidIds: number[];
};

export async function loadAssessmentRows(users: number[], accounts: { id: number; key: string }[], activeId: number, start: string, end: string, fresh = false): Promise<AssessmentRow[]> {
  if (!Array.isArray(users) || users.length > 4 || !Array.isArray(accounts) || accounts.length > 500) throw new Error("จำนวนรายการไม่ถูกต้อง");
  return Promise.all(users.map(async id => {
    const invalidIds: number[] = [];
    const primary = accounts.find(account => account.id === activeId) || accounts[0];
    const candidates = primary ? [primary] : [];
    for (const account of candidates) {
      const response = await loadPerson(account.key, id, end, start, account.id, fresh);
      if (response.invalidKey) { invalidIds.push(account.id); continue; }
      if (!response.data || !response.access) return { id, error: response.error || "อ่านข้อมูลไม่ได้", invalidIds };
      const data = response.data;
      const result = assess(data.tasks, data.entries, { start, end, excludedDates: [], calendarConfirmed: true, teamMedian: data.team.median, fillMissingScores: true });
      const t = result.insights.timesheet;
      const stats = { workload: data.tasks.length, onTime: result.onTime.percent, onTimeCount: result.onTime.count, dueTasks: result.onTime.total, late: result.onTime.late, pending: result.onTime.pending, hours: data.entries === null ? null : result.hours, overdue: result.insights.overdueTasks.length, maxOverdueDays: result.insights.maxOverdueDays, planning: result.insights.planning.percent, planned: result.insights.planning.complete, newTasks: result.insights.planning.total, loggedPercent: t.loggedPercent, loggedDays: t.loggedDays, workdays: t.workdays, missingDays: t.missingDays, fullDays: t.fullDays, fullPercent: t.fullPercent, stale: result.insights.staleTasks.length };
      return { id, level: result.level, stats, total: result.normalized, performance: result.metrics.filter(m => m.category === "ผลงาน").reduce((n, m) => n + (m.score || 0), 0), discipline: result.metrics.filter(m => m.category === "วินัย").reduce((n, m) => n + (m.score || 0), 0), metrics: result.metrics.map(({ id, title, score, max, provisional }) => ({ id, title, score, max, provisional })), mode: response.access.mode, owner: response.access.owner.name, preliminary: result.provisionalCount > 0, invalidIds };
    }
    return { id, error: "ไม่มี key ที่ใช้งานได้ กรุณาเชื่อมต่อบัญชี", invalidIds };
  }));
}
