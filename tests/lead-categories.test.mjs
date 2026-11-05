import test from "node:test";
import assert from "node:assert/strict";
import {
  HEALTHFACTOR_COMPANY_ID,
  VERKOOP_STUDIO_COMPANY_ID,
  companyCategories,
  leadCategory,
  leadCategoryLabel,
  matchesLeadCategory,
} from "../src/lib/lead-categories.ts";

const verkoop = (campaign) => ({ company_id: VERKOOP_STUDIO_COMPANY_ID, campaign });
const healthfactor = (campaign) => ({ company_id: HEALTHFACTOR_COMPANY_ID, campaign });

test("Verkoop Studio separates academy signups from agency leads", () => {
  assert.equal(leadCategory(verkoop("verkoop.studio academy")), "academy");
  assert.equal(leadCategory(verkoop("verkoop.studio website")), "agency");
  assert.equal(leadCategory(verkoop(null)), "agency");
  assert.equal(leadCategory(verkoop("Gent outreach")), "agency");
  assert.deepEqual(companyCategories(VERKOOP_STUDIO_COMPANY_ID).categories, [
    "agency",
    "academy",
    "giveaway",
  ]);
  assert.equal(matchesLeadCategory(verkoop("verkoop.studio academy"), "agency"), false);
  assert.equal(matchesLeadCategory(verkoop("verkoop.studio website"), "agency"), true);
  assert.equal(matchesLeadCategory(verkoop("verkoop.studio academy"), "all"), true);
  assert.equal(leadCategoryLabel(verkoop("verkoop.studio academy")), "Academy");
  assert.equal(leadCategoryLabel(verkoop("verkoop.studio website")), "Verkoop Studio");
});

test("Healthfactor keeps its boxing and gym interests", () => {
  assert.equal(leadCategory(healthfactor("Healthfactor boksen")), "boxing");
  assert.equal(leadCategory(healthfactor("Fitness proefles")), "gym");
  assert.equal(leadCategory(healthfactor("boksen en gym")), "unknown");
  assert.equal(leadCategory(healthfactor(null)), "unknown");
});

test("other companies have no categories and are never filtered out", () => {
  const other = { company_id: "11111111-1111-4111-8111-111111111111", campaign: "academy" };
  assert.equal(companyCategories(other.company_id), null);
  assert.equal(leadCategory(other), null);
  assert.equal(leadCategoryLabel(other), null);
  assert.equal(matchesLeadCategory(other, "academy"), true);
});

test("the free-website campaign gets its own badge, apart from agency work", () => {
  assert.equal(leadCategory(verkoop("Verkoop Studio gratis website")), "giveaway");
  assert.equal(leadCategoryLabel(verkoop("Verkoop Studio gratis website")), "Gratis website");
  assert.equal(leadCategory(verkoop("verkoop.studio website")), "agency");
  assert.equal(leadCategory(verkoop("Verkoop Studio academy")), "academy");
  assert.equal(matchesLeadCategory(verkoop("Verkoop Studio gratis website"), "agency"), false);
  assert.equal(matchesLeadCategory(verkoop("Verkoop Studio gratis website"), "giveaway"), true);
  assert.equal(matchesLeadCategory(verkoop("Verkoop Studio gratis website"), "all"), true);
});
