const { test } = require("node:test");
const assert = require("node:assert/strict");
const loadTs = require("./load-ts.cjs");
const { parseAccounts, emptyAccounts } = loadTs("lib/saved-accounts.ts");

test("multiple accounts survive parsing independently and malformed records cannot become credentials", () => {
  const store = parseAccounts(JSON.stringify({ version: 1, activeUserId: 2, accounts: {
    a: { id: 1, name: "One", key: " first ", connectedAt: "now" },
    b: { id: 2, name: "Two", key: "second", status: "invalid" },
    c: { id: 3, name: "Bad", key: "" },
    d: { id: -1, name: "Bad", key: "bad" },
  } }));
  assert.deepEqual(Object.keys(store.accounts), ["1", "2"]);
  assert.equal(store.accounts[1].key, "first");
  assert.equal(store.accounts[2].key, "second");
  assert.equal(store.accounts[2].status, "invalid");
  assert.equal(store.activeUserId, 2);
});

test("corrupt or unsupported browser storage returns an empty account store", () => {
  for (const value of [null, "not json", "null", '{"version":999}', '{"version":1,"accounts":null}']) assert.deepEqual(parseAccounts(value), emptyAccounts());
});
