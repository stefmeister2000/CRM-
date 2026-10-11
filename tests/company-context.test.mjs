import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseCompany,
  initializeCompany,
  getCompanyId,
  resetCompanyContext,
  VERKOOP_COMPANY_ID,
} from "../src/lib/company-context.ts";
const companies = [
  { id: "client", name: "Client", role: "admin", platform_owner: true },
  { id: VERKOOP_COMPANY_ID, name: "Verkoop Studio", role: "admin", platform_owner: true },
];
test("company selection prefers verified membership and defaults to Verkoop Studio", () => {
  assert.equal(chooseCompany(companies, "client").id, "client");
  assert.equal(chooseCompany(companies, "not-a-member").id, VERKOOP_COMPANY_ID);
  assert.equal(chooseCompany([], "client"), undefined);
});
test("initialization never trusts a previous user's company and handles revoked membership", async () => {
  resetCompanyContext();
  const client = { rpc: async () => ({ data: companies, error: null }) };
  await initializeCompany(client, "owner");
  assert.equal(getCompanyId(), VERKOOP_COMPANY_ID);
  client.rpc = async () => ({ data: [companies[0]], error: null });
  await initializeCompany(client, "other-user");
  assert.equal(getCompanyId(), "client");
  client.rpc = async () => ({ data: [], error: null });
  await initializeCompany(client, "other-user");
  assert.equal(getCompanyId(), null);
});
test("company lookup errors stop initialization instead of silently picking a company", async () => {
  await assert.rejects(
    initializeCompany(
      { rpc: async () => ({ data: null, error: { message: "offline" } }) },
      "owner",
    ),
    /niet worden geladen/,
  );
});
