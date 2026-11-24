const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { assess } = loadTs('lib/assessment.ts');
const { assessmentTips, projectAssessmentScore } = loadTs('lib/assessment-tips.ts');
const start = '2026-08-11', end = '2026-08-14';
const settings = { start, end, excludedDates: [], calendarConfirmed: true, teamMedian: 2, fillMissingScores: true };
const tasks = [{ id: 42, subject: 'Current work', projectId: 1, project: 'Project', status: 'Doing', done: false, due: '2026-08-12', created: start, updated: start, estimate: null, completed: null, hours: 0 }];
test('tips use current-person evidence, link relevant work, and skip transferred or full-score criteria', () => {
  const result = assess(tasks, [], settings);
  const tips = assessmentTips(result, tasks, start, end);
  assert.deepEqual(tips.find(t => t.id === '1.2').tasks.map(t => t.id), [42]);
  assert.deepEqual(tips.find(t => t.id === '2.3').tasks.map(t => t.id), [42]);
  assert.ok(!tips.some(t => t.id === '1.4'));
  for (const tip of tips) assert.ok(tip.gap > 0);
  for (let i = 1; i < tips.length; i++) if (tips[i].provisional === tips[i - 1].provisional) assert.ok(tips[i - 1].gap >= tips[i].gap);
  const logs = ['2026-08-11','2026-08-12','2026-08-13','2026-08-14'].map((day, id) => ({ id, day, hours: 7, linked: true, described: true }));
  const completeAttendance = assessmentTips(assess(tasks, logs, settings), tasks, start, end);
  for (const id of ['2.1','2.2','2.4']) assert.ok(!completeAttendance.some(t => t.id === id));
});
test('missing evidence is labelled for verification instead of being presented as confirmed absence', () => {
  const result = assess(tasks, null, settings);
  const tips = assessmentTips(result, tasks, start, end);
  for (const id of ['2.1','2.2','2.4']) {
    const tip = tips.find(t => t.id === id);
    assert.equal(tip.provisional, true);
    assert.equal(tip.gain, null);
    assert.match(tip.action, /ตรวจสอบข้อมูล/);
  }
});
test('projection adds only selected confirmed gains, never double-counts IDs, and stays on the 100-point scale', () => {
  const result = assess(tasks, [], settings);
  const tips = assessmentTips(result, tasks, start, end);
  const overdue = tips.find(t => t.id === '1.2');
  assert.equal(overdue.gain, 1);
  const one = projectAssessmentScore(result, tips, ['1.2','1.2','unknown']);
  assert.equal(one.gain, 1);
  assert.equal(one.count, 1);
  assert.equal(one.total, result.normalized + 1);
  const none = projectAssessmentScore(result, tips, []);
  assert.equal(none.gain, 0);
  assert.equal(none.total, result.normalized);
  const all = projectAssessmentScore(result, tips, tips.map(t => t.id));
  const provisionalWeight = tips.filter(t => t.provisional).reduce((sum,t) => sum + t.max, 0);
  assert.ok(Math.abs(all.total - (100 - provisionalWeight)) < 1e-9);
  const missing = assess(tasks, null, settings);
  const missingTips = assessmentTips(missing, tasks, start, end);
  assert.equal(projectAssessmentScore(missing, missingTips, ['2.1','2.2','2.4']).gain, 0);
});
