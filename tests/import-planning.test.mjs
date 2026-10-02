import test from "node:test";
import assert from "node:assert/strict";
import { planLeadImport, parseCsv, findDuplicate } from "../src/lib/sales.ts";
const row = {
  company: "Example",
  contact_name: "Alex",
  email: "alex@example.com",
  linkedin_url: null,
};
test("same-file duplicates target the actual inserted ID", () => {
  const { fresh, dupes } = planLeadImport(
    [row, { ...row, phone: "123" }],
    [],
    () => "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(fresh.length, 1);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].existingId, fresh[0].id);
  assert.equal(dupes[0].row.phone, "123");
});
test("retry matches previously saved rows and does not insert them again", () => {
  const { fresh, dupes } = planLeadImport([row], [{ ...row, id: "saved" }], () => {
    throw Error("must not insert");
  });
  assert.equal(fresh.length, 0);
  assert.equal(dupes[0].existingId, "saved");
});
test("duplicate matching normalizes email and LinkedIn", () => {
  assert.equal(
    findDuplicate({ ...row, email: " ALEX@EXAMPLE.COM " }, [{ ...row, id: "saved" }]).id,
    "saved",
  );
  assert.equal(
    findDuplicate({ linkedin_url: "https://www.linkedin.com/in/alex/" }, [
      { ...row, email: null, linkedin_url: "linkedin.com/in/alex", id: "saved" },
    ]).id,
    "saved",
  );
});
test("CSV handles BOM, semicolons, quoted separators and multiline notes", () => {
  assert.deepEqual(parseCsv('\uFEFFCompany;Notes\r\nExample;"hello; there\nnext line"'), [
    ["Company", "Notes"],
    ["Example", "hello; there\nnext line"],
  ]);
});
