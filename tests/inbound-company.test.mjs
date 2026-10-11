import test from "node:test";
import assert from "node:assert/strict";
import { resolveInboundCompany } from "../src/lib/inbound-company.ts";
const verkoop = "00000000-0000-4000-8000-000000000001";
function database(rows, error = null) {
  return {
    from: (table) => {
      assert.equal(table, "app_settings");
      let filters = [];
      const q = {
        select: () => q,
        eq: (key, value) => {
          filters.push([key, value]);
          return q;
        },
        maybeSingle: async () => ({
          data: rows.find((row) => filters.every(([k, v]) => row[k] === v)) ?? null,
          error,
        }),
      };
      return q;
    },
  };
}
test("website credentials choose exactly one company", async () => {
  const db = database([
    { company_id: verkoop, key: "inbound_lead_token", value: "a" },
    { company_id: "client", key: "inbound_lead_token", value: "b" },
  ]);
  assert.equal(await resolveInboundCompany(db, "a"), verkoop);
  assert.equal(await resolveInboundCompany(db, "b"), "client");
  assert.equal(await resolveInboundCompany(db, "unknown"), null);
  assert.equal(await resolveInboundCompany(db, ""), null);
});
test("legacy environment token only targets Verkoop and stops working after rotation", async () => {
  assert.equal(await resolveInboundCompany(database([]), "legacy", "legacy"), verkoop);
  assert.equal(
    await resolveInboundCompany(
      database([{ company_id: "client", key: "inbound_lead_token", value: "b" }]),
      "legacy",
      "legacy",
    ),
    verkoop,
  );
  assert.equal(
    await resolveInboundCompany(
      database([{ company_id: verkoop, key: "inbound_lead_token", value: "rotated" }]),
      "legacy",
      "legacy",
    ),
    null,
  );
});
test("intake lookup failure never falls back to a different company", async () => {
  await assert.rejects(
    resolveInboundCompany(database([], new Error("offline")), "legacy", "legacy"),
    /offline/,
  );
});
