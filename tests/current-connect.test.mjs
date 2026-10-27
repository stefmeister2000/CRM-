import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_CONNECT_CODE_KEY,
  createCurrentConnectCode,
  currentCallbackUrl,
  currentExchangeMethodNotAllowed,
  handleCurrentExchangeRequest,
  sha256Hex,
  validConnectState,
} from "../src/lib/current-connect.ts";
import { CURRENT_EXPORT_SETTING_KEY } from "../src/lib/current-export.ts";
import { VERKOOP_STUDIO_COMPANY_ID } from "../src/lib/lead-categories.ts";

const verkoop = VERKOOP_STUDIO_COMPANY_ID;
const other = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-10-26T09:00:00.000Z");
const state = "ab".repeat(16);

// Minimal PostgREST stand-in for app_settings: select/eq/like/limit/maybeSingle, upsert on (company_id,key), delete…select.
function fakeDb(rows = []) {
  const table = rows.map((r) => ({ ...r }));
  const matches = (row, filters) =>
    filters.every(([op, k, v]) =>
      op === "eq" ? row[k] === v : String(row[k]).startsWith(v.replace(/%$/, "")),
    );
  return {
    rows: table,
    from() {
      const q = { filters: [], mode: "select", limit: null };
      const run = () => {
        if (q.mode === "delete") {
          const hit = table.filter((r) => matches(r, q.filters));
          for (const r of hit) table.splice(table.indexOf(r), 1);
          return { data: hit.map((r) => ({ company_id: r.company_id })), error: null };
        }
        const hit = table.filter((r) => matches(r, q.filters));
        return { data: q.limit ? hit.slice(0, q.limit) : hit, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (k, v) => (q.filters.push(["eq", k, v]), builder),
        like: (k, v) => (q.filters.push(["like", k, v]), builder),
        limit: (n) => ((q.limit = n), builder),
        delete: () => ((q.mode = "delete"), builder),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        upsert: async (row) => {
          const existing = table.find((r) => r.company_id === row.company_id && r.key === row.key);
          if (existing) Object.assign(existing, row);
          else table.push({ ...row });
          return { error: null };
        },
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      };
      return builder;
    },
  };
}
const exchange = (db, code, at = now) =>
  handleCurrentExchangeRequest(
    new Request("https://crm.example.test/api/integrations/current/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
    { configured: true, admin: async () => db, now: () => at },
  );

test("Approving creates a reporting token once and a hashed single-use code", async () => {
  const db = fakeDb();
  const code = await createCurrentConnectCode(db, verkoop, "user-1", now);
  assert.match(code, /^[a-f0-9]{64}$/);
  const token = db.rows.find((r) => r.key === CURRENT_EXPORT_SETTING_KEY);
  const stored = db.rows.find((r) => r.key === CURRENT_CONNECT_CODE_KEY);
  assert.match(token.value, /^[a-f0-9]{64}$/);
  assert.equal(stored.value, `${await sha256Hex(code)}:${now.getTime() + 300000}`);
  assert.ok(!stored.value.includes(code), "only the hash is stored");
  // A second approval keeps the existing token (a pasted connection keeps working) and replaces the code.
  const again = await createCurrentConnectCode(db, verkoop, "user-1", now);
  assert.equal(db.rows.find((r) => r.key === CURRENT_EXPORT_SETTING_KEY).value, token.value);
  assert.equal(db.rows.filter((r) => r.key === CURRENT_CONNECT_CODE_KEY).length, 1);
  assert.notEqual(again, code);
});

test("Current exchanges the code once for the workspace ID and token of that company", async () => {
  const db = fakeDb([
    { company_id: other, key: CURRENT_EXPORT_SETTING_KEY, value: "f".repeat(64) },
  ]);
  const code = await createCurrentConnectCode(db, verkoop, "user-1", now);
  const token = db.rows.find(
    (r) => r.key === CURRENT_EXPORT_SETTING_KEY && r.company_id === verkoop,
  ).value;
  const first = await exchange(db, code);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.deepEqual(await first.json(), { workspaceId: verkoop, token });
  const second = await exchange(db, code);
  assert.equal(second.status, 400, "the code works once");
  assert.equal(
    db.rows.some((r) => r.key === CURRENT_CONNECT_CODE_KEY),
    false,
  );
});

test("Expired, malformed or unknown codes are refused and an expired code is used up", async () => {
  const db = fakeDb();
  const code = await createCurrentConnectCode(db, verkoop, "user-1", now);
  assert.equal((await exchange(db, "a".repeat(64))).status, 400);
  assert.equal((await exchange(db, "not-a-code")).status, 400);
  assert.equal((await exchange(db, code, new Date(now.getTime() + 301000))).status, 400);
  assert.equal((await exchange(db, code)).status, 400);
  const bad = await handleCurrentExchangeRequest(
    new Request("https://crm.example.test/x", { method: "POST", body: "{" }),
    { configured: true, admin: async () => db },
  );
  assert.equal(bad.status, 400);
  const off = await handleCurrentExchangeRequest(
    new Request("https://crm.example.test/x", { method: "POST" }),
    {
      configured: false,
      admin: async () => db,
    },
  );
  assert.equal(off.status, 503);
  assert.equal(currentExchangeMethodNotAllowed().status, 405);
});

test("Only Current's callback receives the code; states are 32 hex characters", () => {
  assert.equal(validConnectState(state), true);
  assert.equal(validConnectState("x"), false);
  assert.equal(validConnectState(undefined), false);
  assert.equal(
    currentCallbackUrl(state, { code: "c".repeat(64) }),
    `https://perfomance.verkoop.studio/api/crm/callback?state=${state}&code=${"c".repeat(64)}`,
  );
  assert.equal(
    currentCallbackUrl(state, { error: "denied" }),
    `https://perfomance.verkoop.studio/api/crm/callback?state=${state}&error=denied`,
  );
});
