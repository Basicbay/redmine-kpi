const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");

test("pagination fetches all records, and partial or duplicate data fails closed", async () => {
  const rows = Array.from({ length: 205 }, (_, id) => ({ id }));
  const offsets = [];
  const { readAll } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    const offset = Number(new URL(path, "https://example.com").searchParams.get("offset"));
    offsets.push(offset);
    return { issues: rows.slice(offset, offset + 100), total_count: rows.length };
  } } });
  assert.equal((await readAll("issues.json?status_id=*", "issues", "")).length, 205);
  assert.deepEqual(offsets, [0, 100, 200]);
  const incomplete = loadTs("lib/redmine-data.ts", { "./redmine": { request: async () => ({ issues: [], total_count: 1 }) } });
  await assert.rejects(incomplete.readAll("issues.json", "issues", ""), /ดึงข้อมูลไม่ครบ/);
  const duplicate = loadTs("lib/redmine-data.ts", { "./redmine": { request: async () => ({ issues: [{ id: 1 }, { id: 1 }], total_count: 2 }) } });
  await assert.rejects(duplicate.readAll("issues.json", "issues", ""), /ข้อมูลเปลี่ยน/);
});

test("ordinary accounts obtain deduplicated project members without leaking account secrets", async () => {
  const { getDirectory } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    if (path === "users/current.json") return { user: { id: 1, firstname: "Current", lastname: "User", api_key: "NEVER_RETURN" } };
    if (path.startsWith("projects.json")) return { projects: [{ id: 10, name: "Project" }], total_count: 1 };
    if (path.startsWith("users.json")) throw new Error("Redmine HTTP 403");
    return { memberships: [{ id: 1, user: { id: 1, name: "Current User" } }, { id: 2, user: { id: 2, name: "Other User" } }, { id: 3, group: { id: 9 } }], total_count: 3 };
  } } });
  const directory = await getDirectory("");
  assert.equal(directory.users.length, 2);
  assert.equal(JSON.stringify(directory).includes("NEVER_RETURN"), false);
});

test("task completion and hours include all visible authors; user discipline includes only selected user", async () => {
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    if (path.startsWith("issues")) return { total_count: 4, issues: [
      { id: 1, subject: "Done", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Done" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-14T00:00:00Z", estimated_hours: 10, closed_on: "2026-08-13T00:00:00Z" },
      { id: 2, subject: "Closed", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "*** Closed" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-13T00:00:00Z", closed_on: "2026-08-12T18:00:00Z" },
      { id: 3, subject: "Rejected", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Rejected", is_closed: true }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-13T00:00:00Z" },
      { id: 4, subject: "Other user", project: { id: 1, name: "Project" }, assigned_to: { id: 2 }, status: { name: "Done" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-13T00:00:00Z" },
    ] };
    return { total_count: 3, time_entries: [
      { id: 1, issue: { id: 1 }, user: { id: 1 }, spent_on: "2026-08-11", hours: 3, comments: "Description" },
      { id: 2, issue: { id: 1 }, user: { id: 2 }, spent_on: "2026-08-14", hours: 7, comments: "Other author" },
      { id: 3, issue: { id: 1 }, user: { id: 1 }, spent_on: "2026-08-15", hours: 99, comments: "After cutoff" },
    ] };
  } } });
  const data = await getPersonData("", 1, "2026-08-14");
  assert.equal(data.tasks.length, 3);
  assert.equal(data.tasks[0].completed, "2026-08-14");
  assert.equal(data.tasks[0].hours, 10);
  assert.equal(data.tasks[1].completed, "2026-08-13");
  assert.equal(data.tasks[2].done, false);
  assert.equal(data.entries.length, 1);
  assert.equal(JSON.stringify(data).includes("Other author"), false);
});

test("timesheet permission failure preserves task browsing and marks time-dependent fields unavailable", async () => {
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    if (path.startsWith("time_entries")) throw new Error("Redmine HTTP 403");
    return { total_count: 1, issues: [{ id: 1, subject: "Task", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Done" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-12T00:00:00Z" }] };
  } } });
  const data = await getPersonData("", 1, "2026-08-14");
  assert.equal(data.tasks.length, 1);
  assert.equal(data.entries, null);
  assert.equal(data.tasks[0].hours, null);
  assert.equal(data.tasks[0].completed, null);
  assert.match(data.timeError, /403/);
});

test("task creation and timesheet spent dates obey the selected range, inclusive in Bangkok", async () => {
  const paths = [];
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    paths.push(path);
    if (path.startsWith("issues")) return { total_count: 4, issues: ["2026-08-10T16:59:59Z", "2026-08-10T17:00:00Z", "2026-08-14T16:59:59Z", "2026-08-14T17:00:00Z"].map((date, id) => ({ id: id + 1, subject: "Task", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Done" }, created_on: date, updated_on: date })) };
    return { total_count: 4, time_entries: ["2026-08-10", "2026-08-11", "2026-08-14", "2026-08-15"].map((day, id) => ({ id, issue: { id: 2 }, user: { id: 1 }, spent_on: day, hours: 1, comments: "Work" })) };
  } } });
  const data = await getPersonData("", 1, "2026-08-14", "2026-08-11");
  assert.deepEqual(data.tasks.map(task => task.id), [2, 3]);
  assert.deepEqual(data.entries.map(entry => entry.day), ["2026-08-11", "2026-08-14"]);
  assert.equal(data.tasks[0].hours, 2);
  assert.equal(data.tasks[0].completed, "2026-08-14");
  assert.ok(paths.some(path => path.includes("from=2026-08-11&to=2026-08-14")));
  const narrower = await getPersonData("", 1, "2026-08-14", "2026-08-13");
  assert.deepEqual(narrower.tasks.map(task => task.id), [3]);
  assert.deepEqual(narrower.entries.map(entry => entry.day), ["2026-08-14"]);
});

test("team workload is aggregated from project members, including zero-output peers, without exposing their tasks", async () => {
  const issue = (id, userId, projectId, extra = {}) => ({ id, subject: userId === 1 ? "Own task" : "PRIVATE-TEAM-TASK", project: { id: projectId, name: "Project" }, assigned_to: { id: userId }, status: { name: "Done" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-12T00:00:00Z", closed_on: "2026-08-12T00:00:00Z", ...extra });
  const own = [issue(1, 1, 1), issue(2, 1, 2)];
  const peer = [issue(10, 2, 1), issue(11, 2, 1), issue(12, 3, 1, { closed_on: null })];
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    const url = new URL(path, "https://example.com");
    if (url.pathname === "/time_entries.json") return { time_entries: [], total_count: 0 };
    if (url.pathname.includes("memberships")) return { memberships: [1, 2, 3, 4].map(id => ({ id, user: { id, name: "PRIVATE-TEAM-NAME" } })), total_count: 4 };
    if (url.searchParams.has("assigned_to_id")) return { issues: own, total_count: own.length };
    const projectId = Number(url.searchParams.get("project_id"));
    const rows = projectId === 1 ? [own[0], ...peer, issue(99, 2, 999)] : [own[1]];
    return { issues: rows, total_count: rows.length };
  } } });
  const data = await getPersonData("personal-key", 1, "2026-08-14");
  assert.equal(data.team.error, null);
  assert.equal(data.team.memberCount, 4);
  assert.equal(data.team.projectCount, 2);
  assert.equal(data.team.completedTasks, 4);
  assert.equal(data.team.missingCompletion, 1);
  assert.equal(data.team.median, 30.4375 / 4);
  assert.equal(data.tasks.length, 2);
  assert.equal(JSON.stringify(data).includes("PRIVATE-TEAM"), false);
  assert.equal(Object.hasOwn(data.team, "tasks"), false);
});

test("team permission failures do not replace the benchmark with a fabricated value or break personal browsing", async () => {
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    if (path.includes("memberships")) throw new Error("Redmine HTTP 403");
    if (path.startsWith("time_entries")) return { time_entries: [], total_count: 0 };
    return { issues: [{ id: 1, subject: "Own task", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Done" }, created_on: "2026-08-11T00:00:00Z", updated_on: "2026-08-12T00:00:00Z", closed_on: "2026-08-12T00:00:00Z" }], total_count: 1 };
  } } });
  const data = await getPersonData("personal-key", 1, "2026-08-14");
  assert.equal(data.tasks.length, 1);
  assert.equal(data.team.median, null);
  assert.match(data.team.error, /403/);
});

test("pagination loads up to four pages concurrently while preserving order and detecting changed totals", async () => {
  let active = 0, maximum = 0;
  const rows = Array.from({ length: 900 }, (_, id) => ({ id }));
  const { readAll } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    const offset = Number(new URL(path, "https://test").searchParams.get("offset"));
    return { issues: rows.slice(offset, offset + 100), total_count: rows.length };
  } } });
  const start = performance.now();
  const result = await readAll("issues.json", "issues", "key");
  const elapsed = performance.now() - start;
  assert.deepEqual(result, rows);
  assert.equal(maximum, 4);
  console.log(`900-record pagination: ${Math.round(elapsed)} ms, max concurrency ${maximum}; sequential fixture needs 9 network waits`);
  const changing = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => ({ issues: path.includes("offset=0") ? rows.slice(0, 100) : rows.slice(100, 200), total_count: path.includes("offset=0") ? 200 : 201 }) } });
  await assert.rejects(changing.readAll("issues.json", "issues", "key"), /ข้อมูลเปลี่ยน/);
});

test("personal and team issue reads use a padded server-side creation range while local Bangkok bounds stay exact", async () => {
  const paths = [];
  const { getPersonData } = loadTs("lib/redmine-data.ts", { "./redmine": { request: async path => {
    paths.push(new URL(path, "https://test"));
    if (path.includes("memberships")) return { memberships: [{ id: 1, user: { id: 1 } }], total_count: 1 };
    if (path.startsWith("time_entries")) return { time_entries: [], total_count: 0 };
    return { issues: [{ id: 1, subject: "Task", project: { id: 1, name: "Project" }, assigned_to: { id: 1 }, status: { name: "Done" }, created_on: "2026-08-10T17:00:00Z", updated_on: "2026-08-12T00:00:00Z", closed_on: "2026-08-12T00:00:00Z" }], total_count: 1 };
  } } });
  const result = await getPersonData("key", 1, "2026-08-14", "2026-08-11");
  assert.equal(result.tasks.length, 1);
  const issuePaths = paths.filter(path => path.pathname === "/issues.json");
  assert.equal(issuePaths.length, 2);
  assert.ok(issuePaths.every(path => path.searchParams.get("created_on") === "><2026-08-10|2026-08-15"));
});
