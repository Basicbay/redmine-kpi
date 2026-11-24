const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");
const assessment = loadTs("lib/assessment.ts");

function actions() {
  let taskReads = 0;
  let directoryReads = 0;
  const api = loadTs("app/actions.ts", {
    "@/lib/assessment": assessment,
    "@/lib/redmine": { request: async () => ({ user: { id: 1 } }) },
    "@/lib/redmine-data": {
      getDirectory: async () => { directoryReads++; return { current: { id: 1, name: "Owner" } }; },
      getPersonData: async () => { taskReads++; return { tasks: [], entries: [] }; },
    },
  });
  return { api, taskReads: () => taskReads, directoryReads: () => directoryReads };
}

test("missing API keys cannot load a workspace or personal data", async () => {
  const { api, taskReads, directoryReads } = actions();
  const end = assessment.bangkokDate();
  for (const key of ["", "   "]) {
    assert.ok((await api.loadWorkspace(key, end)).error);
    assert.ok((await api.loadPerson(key, 1, end)).error);
  }
  assert.equal(taskReads(), 0);
  assert.equal(directoryReads(), 0);
});

test("other people can be read within the supplied key's permissions and the access mode is explicit", async () => {
  const { api, taskReads } = actions();
  const end = assessment.bangkokDate();
  const limited = await api.loadPerson("provided-key", 2, end, assessment.PERIOD_START, 1);
  assert.ok(limited.data);
  assert.equal(limited.access.mode, "limited");
  assert.equal(limited.access.owner.id, 1);
  assert.ok((await api.loadWorkspace("provided-key", end, assessment.PERIOD_START, 2)).error);
  assert.ok((await api.loadPerson("provided-key", 2, end, assessment.PERIOD_START, 2)).error);
  assert.equal(taskReads(), 1);
  const own = await api.loadPerson("provided-key", 1, end, assessment.PERIOD_START, 1);
  assert.ok(own.data);
  assert.equal(own.access.mode, "own");
  assert.equal(taskReads(), 2);
});

test("server requests never fall back to an environment API key", async () => {
  const { request } = loadTs("lib/redmine.ts");
  const old = process.env.REDMINE_API_KEY;
  process.env.REDMINE_API_KEY = "configured-but-forbidden-fallback";
  try { await assert.rejects(request("users/current.json", ""), /API key/); }
  finally { if (old === undefined) delete process.env.REDMINE_API_KEY; else process.env.REDMINE_API_KEY = old; }
});

test("a denied peer resource stays denied without mislabelling the valid source key as expired", async () => {
  const denied = Object.assign(new Error("HTTP 403"), { status: 403, resource: "issues.json" });
  const api = loadTs("app/actions.ts", {
    "@/lib/assessment": assessment,
    "@/lib/redmine": { request: async () => ({ user: { id: 1, firstname: "Owner", lastname: "One" } }) },
    "@/lib/redmine-data": { getPersonData: async () => { throw denied; } },
  });
  const result = await api.loadPerson("valid-key", 2, assessment.bangkokDate());
  assert.equal(result.data, undefined);
  assert.match(result.error, /403/);
  assert.equal(result.invalidKey, false);
});
