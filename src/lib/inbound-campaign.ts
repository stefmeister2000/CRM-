/**
 * Campaigns the public website sends for an ordinary enquiry. None of these
 * names a running campaign, so none of them is allowed to overwrite one.
 * Compared case-insensitively, after trimming.
 */
const GENERIC_WEBSITE_CAMPAIGNS = [
  "Website inquiry",
  "Verkoop Studio website",
  "verkoop.studio website",
  "stefkeppens.com",
];

const normalise = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim() : "";

export const isGenericWebsiteCampaign = (campaign: string | null | undefined) => {
  const value = normalise(campaign).toLowerCase();
  return value === "" || GENERIC_WEBSITE_CAMPAIGNS.some((name) => name.toLowerCase() === value);
};

export type MatchedCampaign = {
  /** The campaign to write, or null to leave the stored one alone. */
  campaign: string | null;
  /** The campaign that was there before, when this call replaces one. */
  replaced: string | null;
};

/**
 * A contact the CRM already knows can enter a campaign later: someone who
 * asked for a quote in March can enter the free-website giveaway in November.
 * The matched lead then has to carry that campaign, or the studio cannot find
 * its entrants at all.
 *
 * Entering a named campaign therefore re-tags the lead, and the previous name
 * is handed back so it can go in the note. A generic website enquiry is not a
 * campaign and never overwrites one; it only fills a campaign that is empty.
 */
export function matchedLeadCampaign(
  stored: string | null | undefined,
  incoming: string | null | undefined,
): MatchedCampaign {
  const next = normalise(incoming);
  const current = normalise(stored);
  const unchanged: MatchedCampaign = { campaign: null, replaced: null };

  if (!next || next === current) return unchanged;
  if (isGenericWebsiteCampaign(next)) {
    // Only worth writing when the lead carries no campaign at all.
    return current ? unchanged : { campaign: next, replaced: null };
  }
  return { campaign: next, replaced: current || null };
}
