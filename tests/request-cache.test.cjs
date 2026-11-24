const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");

test("request caching is isolated by key, coalesces concurrent reads, supports refresh, and never caches authentication", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.REDMINE_URL;
  process.env.REDMINE_URL = "https://redmine-cache.test";
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ value: options.headers["X-Redmine-API-Key"] }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const { request } = loadTs("lib/redmine.ts");
    const [first, second] = await Promise.all([request("projects.json", "account-a"), request("projects.json", "account-a")]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    await request("projects.json", "account-a");
    assert.equal(calls, 1);
    assert.equal((await request("projects.json", "account-b")).value, "account-b");
    assert.equal(calls, 2);
    await request("projects.json", "account-a", { fresh: true });
    assert.equal(calls, 3);
    await request("users/current.json", "account-a");
    await request("users/current.json", "account-a");
    assert.equal(calls, 5);
  } finally { global.fetch = originalFetch; if (originalUrl === undefined) delete process.env.REDMINE_URL; else process.env.REDMINE_URL = originalUrl; }
});

test("failed requests are not cached and authentication errors identify the failing resource", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.REDMINE_URL;
  process.env.REDMINE_URL = "https://redmine-cache.test";
  let calls = 0;
  global.fetch = async () => { calls++; return new Response("{}", { status: 401 }); };
  try {
    const { request } = loadTs("lib/redmine.ts");
    for (let i = 0; i < 2; i++) await assert.rejects(request("users/current.json", "expired"), error => error.status === 401 && error.resource === "users/current.json");
    assert.equal(calls, 2);
  } finally { global.fetch = originalFetch; if (originalUrl === undefined) delete process.env.REDMINE_URL; else process.env.REDMINE_URL = originalUrl; }
});

test("data expire after thirty seconds rather than remaining cached indefinitely", async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  const originalUrl = process.env.REDMINE_URL;
  process.env.REDMINE_URL = "https://redmine-cache.test";
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  global.fetch = async () => new Response(JSON.stringify({ version: ++calls }), { headers: { "Content-Type": "application/json" } });
  try {
    const { request } = loadTs("lib/redmine.ts");
    assert.equal((await request("projects.json", "one")).version, 1);
    now += 29_999;
    assert.equal((await request("projects.json", "one")).version, 1);
    now += 2;
    assert.equal((await request("projects.json", "one")).version, 2);
  } finally { global.fetch = originalFetch; Date.now = originalNow; if (originalUrl === undefined) delete process.env.REDMINE_URL; else process.env.REDMINE_URL = originalUrl; }
});
