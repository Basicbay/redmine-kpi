import "server-only";
import { request } from "./redmine";
import { bangkokDate, PERIOD_START, teamWorkloadMedian, type Task, type WorkEntry } from "./assessment";

export type TeamBenchmark = {
  median: number | null; memberCount: number; projectCount: number;
  completedTasks: number; missingCompletion: number; error: string | null;
};

type User = { id: number; firstname: string; lastname: string };
export type Person = { id: number; name: string };
type Project = { id: number; name: string };
type Issue = {
  id: number; subject: string; project: Project; assigned_to?: { id: number };
  status: { id: number; name: string }; due_date?: string | null;
  created_on: string; updated_on: string; closed_on?: string | null; estimated_hours?: number | null;
  priority?: { name: string }; tracker?: { name: string }; done_ratio?: number;
};
type Entry = {
  id: number; user: { id: number }; issue?: { id: number }; spent_on: string;
  hours: number; comments?: string;
};

export async function readAll<T>(path: string, collection: string, key: string, fresh = false): Promise<T[]> {
  const readPage = async (offset: number) => {
    const separator = path.includes("?") ? "&" : "?";
    const page = await request<Record<string, unknown>>(`${path}${separator}limit=100&offset=${offset}`, key, { fresh });
    const rows = page[collection];
    if (!Array.isArray(rows) || !Number.isSafeInteger(page.total_count) || (page.total_count as number) < 0) throw new Error("รูปแบบข้อมูล Redmine ไม่ถูกต้อง");
    const total = page.total_count as number;
    if (total > 50000 || (!rows.length && offset < total)) throw new Error("ดึงข้อมูลไม่ครบ จึงยังไม่คำนวณคะแนน กรุณาลองใหม่หรือจำกัดสิทธิ์บัญชีให้เหมาะสม");
    return { rows: rows as T[], total };
  };
  const first = await readPage(0);
  const items = [...first.rows];
  const total = first.total;
  const size = first.rows.length || 100;
  const offsets = Array.from({ length: Math.ceil(Math.max(0, total - items.length) / size) }, (_, i) => items.length + i * size);
  for (let index = 0; index < offsets.length; index += 4) {
    const pages = await Promise.all(offsets.slice(index, index + 4).map(readPage));
    for (const page of pages) {
      if (page.total !== total) throw new Error("ข้อมูลเปลี่ยนระหว่างดึง กรุณาโหลดใหม่ก่อนประเมิน");
      items.push(...page.rows);
    }
  }
  const ids = items.map(item => (item as { id: number }).id);
  if (new Set(ids).size !== ids.length || items.length !== total) throw new Error("ข้อมูลเปลี่ยนระหว่างดึง กรุณาโหลดใหม่ก่อนประเมิน");
  return items;
}

export async function getDirectory(key: string, fresh = false) {
  const [account, projects] = await Promise.all([
    request<{ user: User }>("users/current.json", key),
    readAll<Project>("projects.json?sort=id", "projects", key, fresh),
  ]);
  const current = { id: account.user.id, name: `${account.user.firstname} ${account.user.lastname}`.trim() };
  const people = new Map<number, Person>([[current.id, current]]);
  let source = "ผู้ใช้ทั้งหมด";
  let unavailable = 0;
  try {
    const users = await readAll<User>("users.json?sort=id", "users", key, fresh);
    for (const user of users) people.set(user.id, { id: user.id, name: `${user.firstname} ${user.lastname}`.trim() });
  } catch (error) {
    if (!(error instanceof Error) || !/HTTP (401|403)\b/.test(error.message)) throw error;
    source = "สมาชิกโครงการที่บัญชีนี้เข้าถึงได้";
    // Ordinary accounts can often read project memberships even without the admin users endpoint.
    for (let i = 0; i < projects.length; i += 4) {
      const results = await Promise.allSettled(projects.slice(i, i + 4).map(project => readAll<{ user?: Person }>(`projects/${project.id}/memberships.json`, "memberships", key, fresh)));
      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const member of result.value) if (member.user) people.set(member.user.id, { id: member.user.id, name: member.user.name });
        } else unavailable++;
      }
    }
  }
  return { current, users: [...people.values()].sort((a, b) => a.id === current.id ? -1 : b.id === current.id ? 1 : a.name.localeCompare(b.name, "th")), projects: projects.map(({ id, name }) => ({ id, name })), source, unavailable };
}

export async function getPersonData(key: string, userId: number, end: string, start = PERIOD_START, fresh = false) {
  const paddedStart = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const paddedEnd = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10);
  const issueDates = `created_on=${encodeURIComponent(`><${paddedStart}|${paddedEnd}`)}`;
  const [issues, timeResult] = await Promise.all([
    readAll<Issue>(`issues.json?assigned_to_id=${userId}&status_id=*&sort=id&${issueDates}`, "issues", key, fresh),
    // All visible authors are needed for the task's latest timesheet and actual hours.
    readAll<Entry>(`time_entries.json?from=${start}&to=${end}&sort=id`, "time_entries", key, fresh)
      .then(entries => ({ entries, error: null as string | null }))
      .catch((error: unknown) => ({ entries: null, error: error instanceof Error ? error.message : "อ่านเวลาทำงานไม่ได้" })),
  ]);
  const summary = new Map<number, { last: string; hours: number }>();
  for (const entry of timeResult.entries || []) {
    if (!entry.issue || entry.spent_on < start || entry.spent_on > end) continue;
    const previous = summary.get(entry.issue.id);
    summary.set(entry.issue.id, { last: previous && previous.last > entry.spent_on ? previous.last : entry.spent_on, hours: (previous?.hours || 0) + entry.hours });
  }
  const toTask = (issue: Issue): Task => {
    const time = summary.get(issue.id);
    const status = issue.status.name.replace(/^[\s*]+/, "").trim();
    const done = /^(done|closed)$/i.test(status);
    return {
      id: issue.id, subject: issue.subject, projectId: issue.project.id, project: issue.project.name,
      status: issue.status.name, done, due: issue.due_date || null,
      created: bangkokDate(new Date(issue.created_on)), updated: bangkokDate(new Date(issue.updated_on)),
      estimate: issue.estimated_hours ?? null,
      completed: done && timeResult.entries !== null ? time?.last || (issue.closed_on ? bangkokDate(new Date(issue.closed_on)) : null) : null,
      hours: timeResult.entries === null ? null : time?.hours || 0,
      priority: issue.priority?.name || null, tracker: issue.tracker?.name || null,
      progress: typeof issue.done_ratio === "number" && issue.done_ratio >= 0 && issue.done_ratio <= 100 ? issue.done_ratio : null,
    };
  };
  const tasks = issues.filter(issue => {
    const created = bangkokDate(new Date(issue.created_on));
    return issue.assigned_to?.id === userId && created >= start && created <= end;
  }).map(toTask);
  const entries: WorkEntry[] | null = timeResult.entries === null ? null : timeResult.entries.filter(entry => entry.user.id === userId && entry.spent_on >= start && entry.spent_on <= end).map(entry => ({ id: entry.id, day: entry.spent_on, hours: entry.hours, linked: !!entry.issue, described: !!entry.comments?.trim() }));
  const projectIds = [...new Set(tasks.map(task => task.projectId))];
  let team: TeamBenchmark = { median: null, memberCount: 0, projectCount: projectIds.length, completedTasks: 0, missingCompletion: 0, error: null };
  try {
    if (!projectIds.length) throw new Error("ไม่มีโครงการในช่วงวันที่เลือกสำหรับหาค่ากลางทีม");
    if (timeResult.entries === null) throw new Error("อ่านเวลาทำงานไม่ได้ จึงยังยืนยันวันเสร็จของงานทีมไม่ได้");
    const memberIds = new Set<number>([userId]);
    const teamIssues = new Map<number, Issue>();
    for (let index = 0; index < projectIds.length; index += 4) {
      const pages = await Promise.all(projectIds.slice(index, index + 4).map(async projectId => {
        const [members, projectIssues] = await Promise.all([
          readAll<{ user?: { id: number } }>(`projects/${projectId}/memberships.json`, "memberships", key, fresh),
          readAll<Issue>(`issues.json?project_id=${projectId}&subproject_id=!*&status_id=*&sort=id&${issueDates}`, "issues", key, fresh),
        ]);
        return { projectId, members, projectIssues };
      }));
      for (const page of pages) {
        for (const member of page.members) if (member.user) memberIds.add(member.user.id);
        for (const issue of page.projectIssues) if (issue.project.id === page.projectId) teamIssues.set(issue.id, issue);
      }
    }
    // Keep the employee's own snapshot identical to the personal assessment.
    for (const issue of issues) if (projectIds.includes(issue.project.id)) teamIssues.set(issue.id, issue);
    const samples = [...teamIssues.values()].filter(issue => issue.assigned_to && memberIds.has(issue.assigned_to.id))
      .map(issue => ({ ...toTask(issue), assigneeId: issue.assigned_to!.id }));
    team = { ...teamWorkloadMedian(samples, [...memberIds], start, end), projectCount: projectIds.length, error: null };
  } catch (error) {
    team.error = error instanceof Error ? error.message : "อ่านค่ากลางทีมไม่สำเร็จ";
  }
  // Only aggregate team statistics leave the server; no other person's tasks or timesheets.
  return { tasks, entries, timeError: timeResult.error, team, loadedAt: new Date().toISOString() };
}
