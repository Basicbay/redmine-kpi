export const PERIOD_START = "2026-08-11";
export const PERIOD_END = "2026-12-31";

export type Task = {
  id: number; subject: string; projectId: number; project: string; status: string;
  done: boolean; due: string | null; created: string; updated: string;
  estimate: number | null; completed: string | null; hours: number | null;
  priority?: string | null; tracker?: string | null; progress?: number | null;
};
export type WorkEntry = { id: number; day: string; hours: number; linked: boolean; described: boolean };
export type AssessmentSettings = {
  start: string; end: string; excludedDates: string[]; calendarConfirmed: boolean;
  teamMedian: number | null;
  excludeAttendance?: boolean;
  assumeAttendance?: boolean;
  fillMissingScores?: boolean;
};
export type Metric = {
  id: string; title: string; category: "ผลงาน" | "วินัย"; max: number;
  score: number | null; actual: string; target: string; detail: string;
  excluded?: boolean;
  assumed?: boolean;
  provisional?: boolean;
};

export function bangkokDate(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function workdays(start: string, end: string, excluded: string[]): string[] {
  const skip = new Set(excluded);
  const days: string[] = [];
  for (const date = new Date(`${start}T00:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !skip.has(day)) days.push(day);
  }
  return days;
}

const proportional = (value: number, target: number, max: number) => Math.max(0, Math.min(max, value / target * max));
const ratio = (n: number, d: number) => d ? `${n}/${d} (${(n / d * 100).toFixed(1)}%)` : "ไม่มีข้อมูลในรอบ";

export const periodMonths = (start: string, end: string) => (Date.parse(end) - Date.parse(start) + 86400000) / 86400000 / (365.25 / 12);

export function teamWorkloadMedian(tasks: (Task & { assigneeId: number })[], memberIds: number[], start: string, end: string) {
  const counts = new Map([...new Set(memberIds)].map(id => [id, 0]));
  const seen = new Set<number>();
  let missingCompletion = 0;
  for (const task of tasks) {
    if (seen.has(task.id) || !counts.has(task.assigneeId) || task.created < start || task.created > end) continue;
    seen.add(task.id);
    if (!task.done) continue;
    if (!task.completed) { missingCompletion++; continue; }
    if (task.completed >= start && task.completed <= end) counts.set(task.assigneeId, counts.get(task.assigneeId)! + 1);
  }
  const monthly = [...counts.values()].map(count => count / periodMonths(start, end)).sort((a, b) => a - b);
  const middle = Math.floor(monthly.length / 2);
  const median = monthly.length ? monthly.length % 2 ? monthly[middle] : (monthly[middle - 1] + monthly[middle]) / 2 : null;
  return { median, memberCount: counts.size, completedTasks: [...counts.values()].reduce((sum, count) => sum + count, 0), missingCompletion };
}

export function assess(tasks: Task[], entries: WorkEntry[] | null, settings: AssessmentSettings) {
  const { start, end } = settings;
  const inPeriod = (date: string | null) => !!date && date >= start && date <= end;
  const existing = tasks.filter(task => task.created >= start && task.created <= end);
  const completed = existing.filter(task => task.done && inPeriod(task.completed));
  const due = existing.filter(task => inPeriod(task.due));
  const created = existing.filter(task => inPeriod(task.created));
  const round = existing.filter(task => inPeriod(task.created) || inPeriod(task.due) || inPeriod(task.completed));
  const estimatedCount = round.filter(task => task.estimate !== null && task.estimate > 0).length;
  const transferred = estimatedCount < 10;
  const onTime = due.filter(task => task.done && task.completed && task.completed <= task.due!).length;
  const late = due.filter(task => task.done && task.completed && task.completed > task.due!).length;
  const pending = due.filter(task => !task.done).length;
  const unknown = due.filter(task => task.done && !task.completed).length;
  const onTimePercent = due.length ? Math.round(onTime / due.length * 100) : null;
  const missingCompletion = existing.filter(task => task.done && !task.completed);
  const dueUnknown = due.some(task => task.done && !task.completed);
  // This is the current status snapshot; historical cutoffs are labelled as provisional in the UI.
  const overdueTasks = existing.filter(task => task.due && task.due < end && !task.done)
    .map(task => ({ id: task.id, subject: task.subject, days: (Date.parse(end) - Date.parse(task.due!)) / 86400000 }))
    .sort((a, b) => b.days - a.days || a.id - b.id);
  const overdue = overdueTasks.length;
  const staleTasks = existing.filter(task => !task.done && (Date.parse(end) - Date.parse(task.updated)) / 86400000 > 7)
    .map(task => ({ id: task.id, subject: task.subject, days: (Date.parse(end) - Date.parse(task.updated)) / 86400000 }))
    .sort((a, b) => b.days - a.days || a.id - b.id);
  const estimated = completed.filter(task => task.estimate !== null && task.estimate > 0);
  const accurate = estimated.filter(task => task.hours !== null && Math.abs(task.hours - task.estimate!) <= task.estimate! * 0.3 + 1e-9).length;
  const accurateUnknown = estimated.some(task => task.hours === null);
  const days = workdays(start, end, settings.excludedDates);
  const dayHours = new Map<string, number>();
  const logs = (entries || []).filter(entry => inPeriod(entry.day));
  for (const entry of logs) dayHours.set(entry.day, (dayHours.get(entry.day) || 0) + entry.hours);
  const loggedDays = days.filter(day => dayHours.has(day)).length;
  const fullDays = days.filter(day => (dayHours.get(day) || 0) >= 7).length;
  const missingDates = days.filter(day => !dayHours.has(day));
  const planned = created.filter(task => task.due && task.estimate !== null && task.estimate > 0).length;
  const quality = logs.filter(entry => entry.linked && entry.described).length;
  // Use the same prorated month unit for the employee and the supplied team median.
  const months = periodMonths(start, end);
  const monthly = completed.length / months;
  const metrics: Metric[] = [
    { id: "1.1", title: "ส่งงานตรงเวลา", category: "ผลงาน", max: transferred ? 40 : 25,
      score: due.length && !dueUnknown ? proportional(onTime / due.length, 0.85, transferred ? 40 : 25) : null,
      actual: due.length ? `${onTimePercent}% (${onTime}/${due.length})` : "ไม่มีข้อมูลในรอบ", target: "≥ 85%", detail: `ส่งช้า ${late} งาน · ยังไม่เสร็จ ${pending} งาน${unknown ? ` · ยังระบุวันเสร็จไม่ได้ ${unknown} งาน` : ""} · งานครบกำหนดในรอบ ใช้วันลงเวลาครั้งสุดท้ายของงาน หรือวันปิดงานเมื่อไม่มี timesheet${transferred ? " · รับน้ำหนัก 15 คะแนนจากข้อ 1.4" : ""}` },
    { id: "1.2", title: "งานค้างเลยกำหนด", category: "ผลงาน", max: 10,
      score: Math.max(0, 10 - overdue), actual: `${overdue} งาน`, target: "0 งาน", detail: "งานที่สร้างในช่วงวันที่เลือก สถานะยังไม่เป็น Done/Closed และเลย Due date หักงานละ 1 คะแนน ต่ำสุด 0 คะแนน" },
    { id: "1.3", title: "ปริมาณงาน", category: "ผลงาน", max: 10,
      score: settings.teamMedian !== null && settings.teamMedian >= 0 ? settings.teamMedian === 0 ? 10 : proportional(monthly, settings.teamMedian, 10) : null,
      actual: `${completed.length} งาน / ${monthly.toFixed(2)} งานต่อเดือน`, target: settings.teamMedian === null ? "≥ ค่ากลางของทีม" : `≥ ${settings.teamMedian.toFixed(2)} งาน/เดือน`, detail: `นับงาน Done/Closed ที่ยืนยันวันเสร็จในรอบได้ ทั้งบุคคลและทีมใช้เดือน = จำนวนวัน ÷ 30.4375${settings.teamMedian === null ? " · อ่านค่ากลางทีมไม่ได้" : ""}${missingCompletion.length ? ` · ไม่นับ ${missingCompletion.length} งานที่ยังไม่ทราบวันเสร็จ` : ""}` },
    { id: "1.4", title: "ความแม่นยำในการประมาณเวลา", category: "ผลงาน", max: transferred ? 0 : 15,
      score: transferred ? 0 : estimated.length && !accurateUnknown && !missingCompletion.length ? proportional(accurate / estimated.length, 0.8, 15) : null,
      actual: transferred ? `ย้ายน้ำหนักไปข้อ 1.1 (${estimatedCount} งานมีประมาณเวลา)` : ratio(accurate, estimated.length), target: "≥ 80% คลาดเคลื่อนไม่เกิน ±30%", detail: "นับงานมีประมาณเวลาในรอบ (สร้าง/ครบกำหนด/เสร็จในรอบ) หากน้อยกว่า 10 งานย้ายน้ำหนัก; ความแม่นยำใช้เฉพาะงานเสร็จ เทียบชั่วโมงรวมของงานที่เข้าถึงได้" },
    { id: "2.1", title: "ลง timesheet ทุกวันทำงาน", category: "วินัย", max: 15,
      score: entries !== null && settings.calendarConfirmed && days.length ? proportional(loggedDays / days.length, 0.95, 15) : null,
      actual: ratio(loggedDays, days.length), target: "≥ 95%", detail: `วันที่มี Time Sheet ของผู้ใช้ ÷ วันทำงานจันทร์–ศุกร์${settings.excludedDates.length ? " หักวันที่กำหนด" : " ไม่หักวันหยุดและวันลา"}${settings.calendarConfirmed ? "" : " · ยังไม่ยืนยันฐานวันทำงาน"}` },
    { id: "2.2", title: "ลงเวลาครบวัน", category: "วินัย", max: 10,
      score: entries !== null && settings.calendarConfirmed && days.length ? proportional(fullDays / days.length, 0.9, 10) : null,
      actual: ratio(fullDays, days.length), target: "≥ 90% ของวันทำงาน ลง ≥ 7 ชม.", detail: `รวมชั่วโมง Time Sheet ของผู้ใช้ทุกงานต่อวัน นับวันที่ครบ 7 ชั่วโมงขึ้นไป เทียบวันจันทร์–ศุกร์${settings.excludedDates.length ? " หักวันที่กำหนด" : " ไม่หักวันหยุดและวันลา"}` },
    { id: "2.3", title: "วางแผนงานครบ", category: "วินัย", max: 10,
      score: created.length ? proportional(planned / created.length, 1, 10) : null,
      actual: ratio(planned, created.length), target: "100%", detail: "งานที่สร้างในรอบและมอบหมายให้ผู้ใช้นี้ ต้องมีทั้ง Due date และ Estimated time มากกว่า 0" },
    { id: "2.4", title: "คุณภาพการลงเวลา", category: "วินัย", max: 5,
      score: entries !== null && logs.length ? proportional(quality / logs.length, 0.95, 5) : null,
      actual: ratio(quality, logs.length), target: "≥ 95%", detail: "รายการลงเวลาของผู้ใช้ในรอบ ต้องผูกเลขงานและมีคำอธิบาย (ตรวจว่ามีข้อความ ยังไม่ตัดสินคุณภาพเนื้อหา)" },
  ];
  if (settings.assumeAttendance) {
    for (const metric of metrics.filter(metric => metric.id === "2.1" || metric.id === "2.2")) {
      metric.score = metric.max;
      metric.actual = "ถือว่ามาทำงานครบ";
      metric.assumed = true;
      metric.detail = "ให้คะแนนเต็มตามสมมติฐานที่กำหนดว่ามาทำงานครบ ไม่ใช้วันลาและข้อมูลลงเวลารายวันในการตัดคะแนนข้อนี้";
    }
  } else if (settings.excludeAttendance) {
    for (const metric of metrics.filter(metric => metric.id === "2.1" || metric.id === "2.2")) {
      metric.excluded = true;
      metric.max = 0;
      metric.score = null;
      metric.actual = "ไม่นำมาประเมิน";
      metric.target = "—";
      metric.detail = "ยกเว้นตามเกณฑ์ที่ปรับใหม่ ไม่ใช้วันลา การลงเวลารายวัน หรือชั่วโมงต่อวันในการคิดคะแนนข้อนี้";
    }
  }
  if (settings.fillMissingScores) {
    for (const metric of metrics.filter(metric => !metric.excluded && metric.score === null)) {
      metric.score = 0;
      metric.provisional = true;
      metric.detail += " · แสดง 0 คะแนนชั่วคราวเนื่องจากข้อมูลยังไม่พอ ยังคงต้องตรวจสอบข้อนี้";
    }
  }
  const possible = metrics.reduce((sum, metric) => sum + metric.max, 0);
  const scored = metrics.filter(metric => !metric.excluded && metric.score !== null);
  const earned = scored.reduce((sum, metric) => sum + metric.score!, 0);
  const available = scored.reduce((sum, metric) => sum + metric.max, 0);
  const normalized = possible ? earned / possible * 100 : 0;
  const provisionalCount = metrics.filter(metric => metric.provisional).length;
  const complete = available === possible;
  const level = complete ? normalized >= 90 ? "ดีเด่น" : normalized >= 80 ? "ดี" : normalized >= 70 ? "ตามมาตรฐาน" : normalized >= 60 ? "ต้องปรับปรุง" : "ไม่ผ่าน" : null;
  const insights = {
    overdueTasks, maxOverdueDays: overdueTasks[0]?.days || 0, staleTasks,
    planning: { complete: planned, total: created.length, missing: created.length - planned, percent: created.length ? Math.round(planned / created.length * 100) : null },
    timesheet: {
      available: entries !== null, workdays: days.length,
      loggedDays: entries === null ? null : loggedDays,
      loggedPercent: entries !== null && days.length ? Math.round(loggedDays / days.length * 100) : null,
      missingDays: entries === null ? null : missingDates.length,
      missingDates: entries === null ? null : missingDates,
      fullDays: entries === null ? null : fullDays,
      fullPercent: entries !== null && days.length ? Math.round(fullDays / days.length * 100) : null,
      shortDays: entries === null ? null : loggedDays - fullDays,
    },
  };
  return { metrics, earned, available, possible, normalized, complete, level, provisionalCount, insights, onTime: { count: onTime, total: due.length, late, pending, unknown, percent: onTimePercent }, workdays: days.length, missingCompletion: missingCompletion.length, estimatedCount, completed: completed.length, hours: logs.reduce((sum, entry) => sum + entry.hours, 0) };
}
