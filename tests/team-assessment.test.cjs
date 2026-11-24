const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const math = loadTs('lib/assessment.ts');
const data = { tasks: [], entries: [], team: { median: 0 } };
function setup(read) { return loadTs('app/team/actions.ts', { '@/lib/assessment': math, '../actions': { loadPerson: read } }); }
const keys = [{ id: 1, key: 'one' }, { id: 2, key: 'two' }];
test('summary uses only the shared account and exactly the individual assessment formula', async () => {
  const calls = [];
  const api = setup(async (key, id) => { calls.push([key, id]); return { data, access: { mode: key === 'two' ? 'own' : 'limited', owner: { name: 'Owner' } } }; });
  const [row] = await api.loadAssessmentRows([2], keys, 1, math.PERIOD_START, '2026-11-24');
  const expected = math.assess([], [], { start: math.PERIOD_START, end: '2026-11-24', excludedDates: [], calendarConfirmed: true, teamMedian: 0, fillMissingScores: true });
  assert.deepEqual(calls, [['one', 2]]);
  assert.equal(row.total, expected.normalized);
  assert.equal(row.level, expected.level);
  assert.equal(row.metrics.length, 8);
  assert.equal(row.mode, 'limited');
  assert.equal(row.stats.onTime, expected.onTime.percent);
  assert.equal(row.stats.overdue, expected.insights.overdueTasks.length);
  assert.equal(row.stats.loggedDays, expected.insights.timesheet.loggedDays);
  assert.equal(row.stats.missingDays, expected.insights.timesheet.missingDays);
  assert.equal(row.stats.fullDays, expected.insights.timesheet.fullDays);
});
test('unreadable timesheets stay unknown in all summary time columns', async () => {
  const api = setup(async () => ({ data: { ...data, entries: null }, access: { mode: 'own', owner: { name: 'Owner' } } }));
  const [row] = await api.loadAssessmentRows([1], keys, 1, math.PERIOD_START, '2026-11-24');
  for (const field of ['hours', 'loggedDays', 'loggedPercent', 'missingDays', 'fullDays', 'fullPercent']) assert.equal(row.stats[field], null, field);
});
test('workload counts every assigned status while criterion 1.3 still counts completed work', async () => {
  const tasks = ['To do', 'Doing', 'Done', 'Closed'].map((status, i) => ({ id: i + 1, subject: status, projectId: 1, project: 'Project', status, done: i >= 2, due: '2026-09-01', created: '2026-08-12', updated: '2026-08-13', estimate: null, completed: i >= 2 ? '2026-08-13' : null, hours: 0 }));
  const api = setup(async () => ({ data: { ...data, tasks }, access: { mode: 'limited', owner: { name: 'Owner' } } }));
  const [row] = await api.loadAssessmentRows([2], keys, 1, math.PERIOD_START, '2026-11-24');
  assert.equal(row.stats.workload, 4);
  const expected = math.assess(tasks, [], { start: math.PERIOD_START, end: '2026-11-24', excludedDates: [], calendarConfirmed: true, teamMedian: 0, fillMissingScores: true });
  assert.equal(expected.completed, 2);
  assert.equal(row.total, expected.normalized);
});
test('invalid shared key does not silently switch to a saved personal account', async () => {
  const calls = [];
  const api = setup(async key => { calls.push(key); return { invalidKey: true, error: '401' }; });
  const [row] = await api.loadAssessmentRows([2], keys, 1, math.PERIOD_START, '2026-11-24');
  assert.equal(row.total, undefined);
  assert.deepEqual(row.invalidIds, [1]);
  assert.deepEqual(calls, ['one']);
});
test('denied and disconnected rows have no fabricated zero score', async () => {
  const api = setup(async () => ({ error: 'HTTP 403', invalidKey: false }));
  const [denied] = await api.loadAssessmentRows([3], keys, 1, math.PERIOD_START, '2026-11-24');
  const [disconnected] = await api.loadAssessmentRows([3], [], 1, math.PERIOD_START, '2026-11-24');
  assert.equal(denied.total, undefined);
  assert.equal(disconnected.total, undefined);
  assert.match(denied.error, /403/);
  await assert.rejects(api.loadAssessmentRows([1,2,3,4,5], keys, 1, math.PERIOD_START, '2026-11-24'));
});
