import test from "node:test";
import assert from "node:assert/strict";
import { exportLead, legacyUtmFromNotes, validExportToken } from "../src/lib/current-export.ts";

const base = {
  id: "lead-1",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
  deleted_at: null,
  stage: "won",
  source: "website",
  campaign: "verkoop.studio website",
  value_estimate: 10000,
  notes:
    "Aanvraag website (2026-10-01T10:00:00Z): Doel: groei\nutm_source: meta\nutm_medium: paid_social\nutm_campaign: Demo",
};
test("estimates never become revenue or conversion dates", () => {
  const item = exportLead(base);
  assert.equal(item.valueEstimate, 10000);
  assert.equal(item.wonAt, null);
  assert.equal(item.paidRevenue, null);
  assert.equal(item.wonValue, null);
  assert.equal(item.attribution.first, null);
  assert.equal(item.attribution.last, null);
  assert.equal(item.attribution.status, "legacy_utm_notes");
  assert.equal("notes" in item, false);
});
test("ambiguous or repeated submissions produce no UTM evidence", () => {
  assert.equal(legacyUtmFromNotes("website", base.notes + "\nutm_source: google"), null);
  assert.equal(legacyUtmFromNotes("website", base.notes + "\n\n" + base.notes), null);
  assert.equal(legacyUtmFromNotes("email", base.notes), null);
  assert.equal(legacyUtmFromNotes("website", "utm_source: meta\nutm_medium: paid_social"), null);
});
test("exact dedicated token required", () => {
  const secret = "a".repeat(64);
  assert.equal(validExportToken("Bearer " + secret, secret), true);
  assert.equal(validExportToken("Bearer " + "b".repeat(64), secret), false);
  assert.equal(validExportToken("Bearer " + secret, undefined), false);
  assert.equal(validExportToken(null, secret), false);
  assert.equal(validExportToken("Bearer " + secret, "bad-config"), false);
});
