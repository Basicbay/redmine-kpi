const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");
const { assess, bangkokDate, validDate, workdays, teamWorkloadMedian, periodMonths } = loadTs("lib/assessment.ts");

const task = (overrides = {}) => ({ id: 1, subject: "Task", projectId: 1, project: "Project", status: "Done", done: true, due: "2026-08-12", created: "2026-08-11", updated: "2026-08-12", estimate: 10, completed: "2026-08-12", hours: 10, ...overrides });
const settings = (overrides = {}) => ({ start: "2026-08-11", end: "2026-08-14", excludedDates: [], calendarConfirmed: true, teamMedian: 1, ...overrides });
const metric = (result, id) => result.metrics.find(item => item.id === id);

test("calendar uses Bangkok dates and excludes weekends, holidays and approved leave once", () => {
  assert.equal(bangkokDate(new Date("2026-08-10T18:00:00Z")), "2026-08-11");
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-08-11"), true);
  assert.deepEqual(workdays("2026-08-11", "2026-08-17", ["2026-08-12", "2026-08-12", "2026-08-15"]), ["2026-08-11", "2026-08-13", "2026-08-14", "2026-08-17"]);
});

test("fewer than ten estimated tasks transfers exactly 15 points to on-time; no inflation", () => {
  const tasks = Array.from({ length: 5 }, (_, i) => task({ id: i, completed: i === 4 ? "2026-08-13" : "2026-08-12" }));
  const result = assess(tasks, [], settings());
  assert.equal(metric(result, "1.1").max, 40);
  assert.ok(Math.abs(metric(result, "1.1").score - (4 / 5 / 0.85 * 40)) < 1e-9);
  assert.equal(metric(result, "1.4").max, 0);
  assert.equal(result.metrics.reduce((sum, item) => sum + item.max, 0), 100);
});

test("ten estimated tasks retain the accuracy weight and ±30% is inclusive", () => {
  const tasks = Array.from({ length: 10 }, (_, i) => task({ id: i, hours: i < 4 ? 7 : i < 8 ? 13 : 13.01 }));
  const result = assess(tasks, [], settings());
  assert.equal(metric(result, "1.1").max, 25);
  assert.equal(metric(result, "1.4").score, 15);
  assert.equal(metric(result, "1.4").actual, "8/10 (80.0%)");
});

test("overdue respects the task date filter, excludes due-on-cutoff and cannot go negative", () => {
  const tasks = Array.from({ length: 12 }, (_, i) => task({ id: i, done: false, completed: null }));
  tasks.push(task({ id: 99, done: false, completed: null, created: "2026-08-10" }));
  tasks.push(task({ id: 100, done: false, completed: null, due: "2026-08-14" }));
  const result = assess(tasks, [], settings());
  assert.equal(metric(result, "1.2").actual, "12 งาน");
  assert.equal(metric(result, "1.2").score, 0);
});

test("the reference 93/148 displays 63% on-time, with 45 late and 10 pending, not 63 total points", () => {
  const tasks = Array.from({ length: 148 }, (_, id) => task({ id, completed: id < 93 ? "2026-08-12" : id < 138 ? "2026-08-13" : null, done: id < 138 }));
  const result = assess(tasks, [], settings());
  assert.deepEqual(result.onTime, { count: 93, total: 148, late: 45, pending: 10, unknown: 0, percent: 63 });
  assert.equal(metric(result, "1.1").actual, "63% (93/148)");
  assert.ok(Math.abs(metric(result, "1.1").score - (93 / 148 / 0.85 * 25)) < 1e-9);
});

test("all assessment metrics exclude tasks created before or after the selected dates", () => {
  const valid = task();
  const older = task({ id: 2, created: "2026-08-10", done: false, completed: null });
  const future = task({ id: 3, created: "2026-08-15", done: false, completed: null });
  assert.deepEqual(assess([older, valid, future], [], settings()), assess([valid], [], settings()));
});

test("missing data and zero denominators are pending rather than automatically full or zero", () => {
  const empty = assess([], null, settings({ teamMedian: null, calendarConfirmed: false }));
  for (const id of ["1.1", "1.3", "2.1", "2.2", "2.3", "2.4"]) assert.equal(metric(empty, id).score, null);
  assert.equal(empty.complete, false);
  assert.equal(empty.level, null);
  const unknown = assess([task({ completed: null })], null, settings());
  assert.equal(metric(unknown, "1.1").score, null);
  assert.equal(metric(unknown, "1.2").score, 10);
  assert.equal(metric(unknown, "1.3").score, 0);
});

test("daily attendance sums split entries, excludes holidays, and quality checks task + comment", () => {
  const entries = [
    { id: 1, day: "2026-08-11", hours: 3, linked: true, described: true },
    { id: 2, day: "2026-08-11", hours: 4, linked: true, described: true },
    { id: 3, day: "2026-08-13", hours: 7, linked: false, described: true },
    { id: 4, day: "2026-08-14", hours: 7, linked: true, described: false },
    { id: 5, day: "2026-08-15", hours: 99, linked: true, described: true },
  ];
  const result = assess([task()], entries, settings({ excludedDates: ["2026-08-12"] }));
  assert.equal(result.workdays, 3);
  assert.equal(metric(result, "2.1").score, 15);
  assert.equal(metric(result, "2.2").score, 10);
  assert.equal(metric(result, "2.4").actual, "2/4 (50.0%)");
  assert.equal(metric(result, "2.4").score, 0.5 / 0.95 * 5);
  assert.equal(metric(assess([task()], entries, settings({ calendarConfirmed: false })), "2.1").score, null);
});

test("planning excludes tasks created outside the round and full score yields a level", () => {
  const entries = [11, 12, 13, 14].map((day, id) => ({ id, day: `2026-08-${day}`, hours: 7, linked: true, described: true }));
  const result = assess([task(), task({ id: 2, created: "2026-01-01", due: null, estimate: null, completed: "2026-01-02" })], entries, settings());
  assert.equal(metric(result, "2.3").actual, "1/1 (100.0%)");
  assert.equal(result.earned, 100);
  assert.equal(result.available, 100);
  assert.equal(result.level, "ดีเด่น");
});

test("the PDF example of 68% on-time against 85% target yields exactly 20 of 25", () => {
  const tasks = Array.from({ length: 100 }, (_, i) => task({ id: i, completed: i < 68 ? "2026-08-12" : "2026-08-13" }));
  assert.equal(metric(assess(tasks, [], settings()), "1.1").score, 20);
});

test("team median includes zero-output members, deduplicates tasks and uses identical date and month units", () => {
  const samples = [
    task({ id: 1, assigneeId: 1 }), task({ id: 2, assigneeId: 1 }),
    task({ id: 3, assigneeId: 2 }), task({ id: 4, assigneeId: 2 }),
    task({ id: 3, assigneeId: 2 }),
    task({ id: 5, assigneeId: 3, completed: null }),
    task({ id: 6, assigneeId: 4, created: "2026-08-10" }),
    task({ id: 7, assigneeId: 99 }),
  ];
  const team = teamWorkloadMedian(samples, [1, 2, 3, 4, 4], "2026-08-11", "2026-08-14");
  assert.equal(team.memberCount, 4);
  assert.equal(team.completedTasks, 4);
  assert.equal(team.median, 1 / periodMonths("2026-08-11", "2026-08-14"));
  assert.equal(team.missingCompletion, 1);
  assert.equal(teamWorkloadMedian([], [], "2026-08-11", "2026-08-14").median, null);
});

test("an odd team cohort uses its middle member rather than its mean", () => {
  const samples = Array.from({ length: 10 }, (_, id) => task({ id, assigneeId: id === 0 ? 1 : 2 }));
  const team = teamWorkloadMedian(samples, [1, 2, 3], "2026-08-11", "2026-08-14");
  assert.equal(team.median, 1 / periodMonths("2026-08-11", "2026-08-14"));
});

test("excluding 2.1–2.2 removes 25 points, ignores attendance and leave, and normalizes a 75-point total", () => {
  const log = [{ id: 1, day: "2026-08-12", hours: 1, linked: true, described: true }];
  const excluded = settings({ excludeAttendance: true, calendarConfirmed: false });
  const result = assess([task()], log, excluded);
  assert.equal(result.possible, 75);
  assert.equal(result.earned, 75);
  assert.equal(result.available, 75);
  assert.equal(result.normalized, 100);
  assert.equal(result.level, "ดีเด่น");
  for (const id of ["2.1", "2.2"]) {
    assert.equal(metric(result, id).excluded, true);
    assert.equal(metric(result, id).max, 0);
    assert.equal(metric(result, id).score, null);
  }
  const differentAttendance = assess([task()], [{ ...log[0], hours: 99 }], { ...excluded, excludedDates: ["2026-08-12"], calendarConfirmed: true });
  assert.equal(differentAttendance.earned, result.earned);
  assert.equal(differentAttendance.normalized, result.normalized);
});

test("remaining missing criteria prevent grading even after attendance is excluded; a zero team median is finite", () => {
  const partial = assess([task()], null, settings({ excludeAttendance: true }));
  assert.equal(partial.possible, 75);
  assert.equal(partial.available, 70);
  assert.equal(partial.complete, false);
  assert.equal(partial.level, null);
  const zero = assess([], [], settings({ excludeAttendance: true, teamMedian: 0 }));
  assert.equal(metric(zero, "1.3").score, 10);
  assert.equal(Number.isFinite(zero.normalized), true);
});

test("the current attendance assumption grants 15 and 10 points and restores the original 100-point base", () => {
  const result = assess([task()], null, settings({ assumeAttendance: true, fillMissingScores: true, calendarConfirmed: false, excludeAttendance: true }));
  assert.equal(result.possible, 100);
  assert.equal(metric(result, "2.1").score, 15);
  assert.equal(metric(result, "2.2").score, 10);
  assert.equal(metric(result, "2.1").assumed, true);
  assert.equal(metric(result, "2.2").assumed, true);
  assert.equal(result.earned, 95);
  assert.equal(result.normalized, 95);
  assert.equal(result.provisionalCount, 1);
});

test("every included criterion has a numeric result; missing evidence is explicitly provisional zero", () => {
  const result = assess([task({ completed: null })], null, settings({ assumeAttendance: true, fillMissingScores: true, teamMedian: null }));
  assert.equal(result.metrics.length, 8);
  assert.ok(result.metrics.every(item => typeof item.score === "number" && Number.isFinite(item.score)));
  assert.equal(metric(result, "1.1").score, 0);
  assert.equal(metric(result, "1.1").provisional, true);
  assert.equal(metric(result, "1.3").score, 0);
  assert.equal(metric(result, "1.3").provisional, true);
  assert.equal(metric(result, "2.4").score, 0);
  assert.equal(metric(result, "2.4").provisional, true);
  assert.equal(result.available, 100);
});

test("attendance assumptions do not change with leave or timesheet hours", () => {
  const policy = settings({ assumeAttendance: true, fillMissingScores: true });
  const noLogs = assess([task()], [], policy);
  const withLogs = assess([task()], [{ id: 1, day: "2026-08-12", hours: 99, linked: true, described: true }], { ...policy, excludedDates: ["2026-08-12"] });
  for (const id of ["2.1", "2.2"]) assert.deepEqual(metric(noLogs, id), metric(withLogs, id));
});

test("real timesheet attendance and the new insights agree on missing, logged and full weekdays", () => {
  const records = [
    { id: 1, day: "2026-08-11", hours: 3, linked: true, described: true },
    { id: 2, day: "2026-08-11", hours: 4, linked: true, described: true },
    { id: 3, day: "2026-08-12", hours: 6, linked: true, described: true },
    { id: 4, day: "2026-08-17", hours: 8, linked: true, described: true },
    { id: 5, day: "2026-08-15", hours: 99, linked: true, described: true },
    { id: 6, day: "2026-08-18", hours: 99, linked: true, described: true },
  ];
  const result = assess([task()], records, settings({ end: "2026-08-17", fillMissingScores: true }));
  assert.deepEqual(result.insights.timesheet, { available: true, workdays: 5, loggedDays: 3, loggedPercent: 60, missingDays: 2, missingDates: ["2026-08-13", "2026-08-14"], fullDays: 2, fullPercent: 40, shortDays: 1 });
  assert.ok(Math.abs(metric(result, "2.1").score - (3 / 5 / 0.95 * 15)) < 1e-9);
  assert.ok(Math.abs(metric(result, "2.2").score - (2 / 5 / 0.9 * 10)) < 1e-9);
  assert.equal(metric(result, "2.1").assumed, undefined);
  assert.equal(metric(result, "2.2").assumed, undefined);
});

test("overdue and stale summaries use cutoff dates, include only pending work, and list oldest first", () => {
  const result = assess([
    task({ id: 1, done: false, completed: null, due: "2026-08-03", updated: "2026-11-16" }),
    task({ id: 2, done: false, completed: null, due: "2026-11-20", updated: "2026-08-03", estimate: null }),
    task({ id: 3, done: false, completed: null, due: "2026-11-24", updated: "2026-11-17" }),
    task({ id: 4, completed: "2026-11-10", updated: "2026-08-03" }),
    task({ id: 5, done: false, completed: null, due: null, updated: "2026-11-25" }),
    task({ id: 6, done: false, completed: null, created: "2026-08-10" }),
  ], [], settings({ end: "2026-11-24" }));
  assert.deepEqual(result.insights.overdueTasks.map(item => [item.id, item.days]), [[1, 113], [2, 4]]);
  assert.equal(result.insights.maxOverdueDays, 113);
  assert.deepEqual(result.insights.staleTasks.map(item => [item.id, item.days]), [[2, 113], [1, 8]]);
  assert.deepEqual(result.insights.planning, { complete: 3, total: 5, missing: 2, percent: 60 });
});

test("unavailable timesheets are not misreported as absences; an empty period has no fabricated percentages", () => {
  const unavailable = assess([], null, settings()).insights.timesheet;
  assert.equal(unavailable.available, false);
  for (const field of ["loggedDays", "loggedPercent", "missingDays", "missingDates", "fullDays", "fullPercent", "shortDays"]) assert.equal(unavailable[field], null);
  const empty = assess([], [], settings({ start: "2026-08-15", end: "2026-08-16" }));
  assert.equal(empty.insights.timesheet.workdays, 0);
  assert.equal(empty.insights.timesheet.loggedPercent, null);
  assert.equal(empty.insights.planning.percent, null);
  assert.equal(empty.insights.maxOverdueDays, 0);
});
