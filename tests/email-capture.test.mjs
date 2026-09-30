import test from "node:test";
import assert from "node:assert/strict";
import { captureEmail, exactPattern } from "../src/lib/mcp/email-capture.ts";

function fakeDb(responses) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, calls: [] };
      queries.push(query);
      const builder = {};
      for (const method of ["select", "ilike", "limit", "insert", "update", "eq", "single"]) {
        builder[method] = (...args) => {
          query.calls.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve, reject) => {
        assert.ok(responses.length, "Unexpected database operation");
        return Promise.resolve(responses.shift()).then(resolve, reject);
      };
      return builder;
    },
  };
}
const input = {
  company: "Example Co",
  email: "alex@example.com",
  subject: "Hello",
  draft: "Product introduction",
};
const ok = { data: null, error: null };

test("new draft creates a new lead, saves draft, and does not mark contact", async () => {
  const db = fakeDb([{ data: [] }, { data: [] }, { data: { id: "new-lead" } }, ok]);
  const result = await captureEmail(db, input, "rep-1");
  assert.deepEqual(result, { leadId: "new-lead", created: true, emailStatus: "draft" });
  const lead = db.queries[2].calls.find((c) => c[0] === "insert")[1];
  assert.equal(lead.stage, "new");
  assert.equal(lead.owner_id, "rep-1");
  const activity = db.queries[3].calls[0][1];
  assert.equal(activity.subject, "DRAFT: Hello");
  assert.equal(
    db.queries.some((q) => q.calls.some((c) => c[0] === "update")),
    false,
  );
});
test("existing draft matches a lead without changing stage or contact date", async () => {
  const db = fakeDb([{ data: [{ id: "existing" }] }, ok]);
  const result = await captureEmail(db, input, "rep-1");
  assert.equal(result.created, false);
  assert.equal(db.queries.length, 2);
});
test("sent email updates contact date and only advances leads still in new", async () => {
  const db = fakeDb([{ data: [{ id: "existing" }] }, ok, ok, ok]);
  const result = await captureEmail(db, { ...input, sent: true }, "rep-1");
  assert.equal(result.emailStatus, "sent");
  assert.equal(db.queries[1].calls[0][1].subject, "Hello");
  assert.ok(db.queries[2].calls[0][1].last_touch_at);
  assert.deepEqual(db.queries[3].calls, [
    ["update", { stage: "contacted" }],
    ["eq", "id", "existing"],
    ["eq", "stage", "new"],
  ]);
});
test("lookup errors stop without creating duplicate leads", async () => {
  const db = fakeDb([{ data: null, error: { message: "unavailable" } }]);
  await assert.rejects(captureEmail(db, input, "rep-1"), /Lead lookup failed/);
  assert.equal(db.queries.length, 1);
});
test("email insert failures report partial result without claiming success", async () => {
  const db = fakeDb([{ data: [{ id: "existing" }] }, { error: { message: "denied" } }]);
  await assert.rejects(captureEmail(db, input, "rep-1"), /email was not saved/);
});
test("contact date update failure is reported as a partial result", async () => {
  const db = fakeDb([{ data: [{ id: "existing" }] }, ok, { error: { message: "denied" } }]);
  await assert.rejects(
    captureEmail(db, { ...input, sent: true }, "rep-1"),
    /Email saved.*contact date was not updated/,
  );
});
test("invalid contact input is rejected before database access", async () => {
  const db = fakeDb([]);
  await assert.rejects(captureEmail(db, { ...input, company: " ", email: "not-email" }, "rep-1"));
  assert.equal(db.queries.length, 0);
});
test("identity matching escapes SQL pattern wildcards", () => {
  assert.equal(exactPattern("100%_sales"), String.raw`100\%\_sales`);
});
