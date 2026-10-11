export const HEALTHFACTOR_COMPANY_ID = "7cf72b35-4445-46db-a4c4-26563ac57dca";

export type HealthfactorCategory = "boxing" | "gym" | "unknown";
export type HealthfactorFilter = "all" | HealthfactorCategory;
export type CategorizedLead = { company_id: string; campaign: string | null };

export const isHealthfactorCompany = (companyId: string) => companyId === HEALTHFACTOR_COMPANY_ID;

export function healthfactorCategory(lead: CategorizedLead): HealthfactorCategory | null {
  if (!isHealthfactorCompany(lead.company_id)) return null;
  // Both historical imports and new website requests carry the form's campaign.
  // Do not infer interests from free-form notes or the old mixed Resend segment.
  const campaign = lead.campaign ?? "";
  const boxing = /\b(boksen|boxing)\b/i.test(campaign);
  const gym = /\b(fitness|gym)\b/i.test(campaign);
  if (boxing === gym) return "unknown";
  return boxing ? "boxing" : "gym";
}

export function matchesHealthfactorCategory(lead: CategorizedLead, filter: HealthfactorFilter) {
  const category = healthfactorCategory(lead);
  return category === null || filter === "all" || category === filter;
}
