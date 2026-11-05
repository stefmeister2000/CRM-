import test from "node:test";
import assert from "node:assert/strict";
import { isGenericWebsiteCampaign, matchedLeadCampaign } from "../src/lib/inbound-campaign.ts";

const GIVEAWAY = "Verkoop Studio gratis website";

test("a known contact that enters a campaign is re-tagged, and the old name is kept", () => {
  const entered = matchedLeadCampaign("Gent outreach", GIVEAWAY);
  assert.equal(entered.campaign, GIVEAWAY);
  assert.equal(entered.replaced, "Gent outreach");

  const firstTime = matchedLeadCampaign(null, GIVEAWAY);
  assert.equal(firstTime.campaign, GIVEAWAY);
  assert.equal(firstTime.replaced, null);
});

test("an ordinary website enquiry never overwrites a campaign", () => {
  for (const generic of [
    "Website inquiry",
    "Verkoop Studio website",
    "  verkoop.studio website  ",
  ]) {
    assert.deepEqual(matchedLeadCampaign(GIVEAWAY, generic), { campaign: null, replaced: null });
    assert.deepEqual(matchedLeadCampaign("Verkoop Studio academy", generic), {
      campaign: null,
      replaced: null,
    });
    assert.equal(isGenericWebsiteCampaign(generic), true);
  }
  // It does fill an empty campaign, as it did before.
  assert.equal(matchedLeadCampaign(null, "Website inquiry").campaign, "Website inquiry");
});

test("nothing is written when the campaign is already right or absent", () => {
  assert.deepEqual(matchedLeadCampaign(GIVEAWAY, GIVEAWAY), { campaign: null, replaced: null });
  assert.deepEqual(matchedLeadCampaign(GIVEAWAY, "  "), { campaign: null, replaced: null });
  assert.deepEqual(matchedLeadCampaign(GIVEAWAY, null), { campaign: null, replaced: null });
  assert.equal(isGenericWebsiteCampaign(GIVEAWAY), false);
});
