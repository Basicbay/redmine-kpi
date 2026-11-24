const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");
const { filterTasksByStatus, statusGroup } = loadTs("lib/task-filters.ts");
const tasks = [
  { id: 1, status: "* To do", created: "2026-08-11" },
  { id: 2, status: "** Doing: In Develop", created: "2026-08-11" },
  { id: 3, status: "Doing: In UAT Test", created: "2026-08-11" },
  { id: 4, status: "Done", created: "2026-08-11" },
  { id: 5, status: "*** Closed", created: "2026-08-11" },
  { id: 6, status: "Rejected", created: "2026-08-11" },
];

test("the four status controls include every Doing stage and normalize starred labels", () => {
  assert.deepEqual(filterTasksByStatus(tasks, "todo").map(task => task.id), [1]);
  assert.deepEqual(filterTasksByStatus(tasks, "doing").map(task => task.id), [3, 2]);
  assert.deepEqual(filterTasksByStatus(tasks, "done").map(task => task.id), [4]);
  assert.deepEqual(filterTasksByStatus(tasks, "closed").map(task => task.id), [5]);
  assert.equal(statusGroup({ status: "Close" }), "closed");
});

test("no selected status shows all tasks, including custom statuses, without changing input", () => {
  const original = tasks.map(task => task.id);
  assert.deepEqual(filterTasksByStatus(tasks, null).map(task => task.id), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(tasks.map(task => task.id), original);
});

test("status filtering respects a project subset and handles an empty list", () => {
  assert.deepEqual(filterTasksByStatus([tasks[1], tasks[3]], "doing").map(task => task.id), [2]);
  assert.deepEqual(filterTasksByStatus([], "done"), []);
});

test("late, unfinished, overdue, stale, and missing-completion buttons have distinct date-aware meanings", () => {
  const records = [
    { ...tasks[3], id: 10, done: true, due: "2026-08-12", completed: "2026-08-13", updated: "2026-08-13" },
    { ...tasks[3], id: 11, done: true, due: "2026-08-12", completed: null, updated: "2026-08-12" },
    { ...tasks[0], id: 12, done: false, due: "2026-08-12", completed: null, updated: "2026-08-01" },
    { ...tasks[0], id: 13, done: false, due: "2026-08-14", completed: null, updated: "2026-08-13" },
    { ...tasks[3], id: 14, done: true, due: "2026-08-12", completed: "2026-08-12", updated: "2026-08-12" },
  ];
  const ids = filter => filterTasksByStatus(records, filter, "2026-08-14").map(task => task.id).sort((a, b) => a - b);
  assert.deepEqual(ids("late"), [10, 12]);
  assert.deepEqual(ids("unfinished"), [12, 13]);
  assert.deepEqual(ids("overdue"), [12]);
  assert.deepEqual(ids("stale"), [12]);
  assert.deepEqual(ids("missing"), [11]);
});
