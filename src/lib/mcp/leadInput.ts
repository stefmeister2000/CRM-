import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SOURCES = ["email", "linkedin", "ads", "referral", "csv"] as const;

export const STAGES = [
  "new",
  "contacted",
  "engaged",
  "meeting",
  "proposal",
  "won",
  "lost",
] as const;

/** Default campaign tag per channel, so every lead the assistant adds is tagged. */
export const CAMPAIGN_BY_SOURCE: Record<(typeof SOURCES)[number], string> = {
  email: "Email outreach",
  linkedin: "LinkedIn outreach",
  ads: "Ads inbound",
  referral: "Referrals",
  csv: "CSV import",
};

export const leadInputSchema = {
  company: z.string().describe("Company / account name. Required."),
  contact_name: z.string().optional().describe("Main contact person."),
  job_title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  source: z
    .enum(SOURCES)
    .optional()
    .describe("Channel tag: email, linkedin, ads, referral or csv. Defaults to email."),
  stage: z
    .enum(STAGES)
    .optional()
    .describe("Pipeline stage. Defaults to new (contacted if you already replied)."),
  campaign: z
    .string()
    .optional()
    .describe("Campaign or list tag. Auto-filled from the channel when omitted."),
  priority: z.number().optional().describe("Importance 1-5, 5 = key account. Defaults to 3."),
  value_estimate: z.number().optional().describe("Estimated deal value in EUR."),
  notes: z.string().optional(),
};

export type LeadInput = {
  company: string;
  contact_name?: string | undefined;
  job_title?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  linkedin_url?: string | undefined;
  website?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  source?: (typeof SOURCES)[number] | undefined;
  stage?: (typeof STAGES)[number] | undefined;
  campaign?: string | undefined;
  priority?: number | undefined;
  value_estimate?: number | undefined;
  notes?: string | undefined;
};

export function normalizeLead(input: LeadInput, userId: string) {
  const source = input.source ?? "email";
  const stage = input.stage ?? "new";
  return {
    ...input,
    company: input.company.trim(),
    email: input.email?.trim().toLowerCase(),
    source,
    stage,
    campaign: input.campaign?.trim() || CAMPAIGN_BY_SOURCE[source],
    priority: input.priority ?? 3,
    owner_id: userId,
    created_by: userId,
    last_touch_at: new Date().toISOString(),
  };
}

/** Find an existing lead by email, LinkedIn URL, or company name. */
export async function findExistingLead(
  supabase: SupabaseClient,
  input: LeadInput,
): Promise<{ id: string; company: string } | null> {
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const { data } = await supabase
      .from("leads")
      .select("id, company")
      .ilike("email", email)
      .limit(1);
    if (data?.length) return data[0] as { id: string; company: string };
  }
  if (input.linkedin_url) {
    const { data } = await supabase
      .from("leads")
      .select("id, company")
      .eq("linkedin_url", input.linkedin_url)
      .limit(1);
    if (data?.length) return data[0] as { id: string; company: string };
  }
  const { data } = await supabase
    .from("leads")
    .select("id, company")
    .ilike("company", input.company.trim())
    .limit(1);
  return data?.length ? (data[0] as { id: string; company: string }) : null;
}
