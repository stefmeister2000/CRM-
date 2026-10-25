export const HEALTHFACTOR_COMPANY_ID = "7cf72b35-4445-46db-a4c4-26563ac57dca";
export const VERKOOP_STUDIO_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

export type LeadCategory = "boxing" | "gym" | "unknown" | "agency" | "academy";
export type LeadCategoryFilterValue = "all" | LeadCategory;
export type CategorizedLead = { company_id: string; campaign: string | null };

type CompanyCategories = {
  legend: string;
  categories: readonly LeadCategory[];
  classify: (campaign: string) => LeadCategory;
};

// Categories are read from the campaign that imports and website forms set.
// Do not infer them from free-form notes or the old mixed Resend segments.
const companies: Record<string, CompanyCategories> = {
  [HEALTHFACTOR_COMPANY_ID]: {
    legend: "Interesse",
    categories: ["boxing", "gym", "unknown"],
    classify: (campaign) => {
      const boxing = /\b(boksen|boxing)\b/i.test(campaign);
      const gym = /\b(fitness|gym)\b/i.test(campaign);
      if (boxing === gym) return "unknown";
      return boxing ? "boxing" : "gym";
    },
  },
  [VERKOOP_STUDIO_COMPANY_ID]: {
    legend: "Soort lead",
    categories: ["agency", "academy"],
    // The academy signup form sends campaign "verkoop.studio academy"; everything else is agency work.
    classify: (campaign) => (/\bacademy\b/i.test(campaign) ? "academy" : "agency"),
  },
};

export const companyCategories = (companyId: string) => companies[companyId] ?? null;

export function leadCategory(lead: CategorizedLead): LeadCategory | null {
  const config = companyCategories(lead.company_id);
  return config ? config.classify(lead.campaign ?? "") : null;
}

export function matchesLeadCategory(lead: CategorizedLead, filter: LeadCategoryFilterValue) {
  const category = leadCategory(lead);
  return category === null || filter === "all" || category === filter;
}
