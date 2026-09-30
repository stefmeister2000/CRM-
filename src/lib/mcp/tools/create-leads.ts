import { defineTool } from "../tool";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { findExistingLead, leadInputSchema, normalizeLead, type LeadInput } from "../leadInput";

export default defineTool({
  name: "create_leads",
  title: "Add several leads",
  description:
    "Add up to 50 B2B leads to the Sales CRM in one go (for example a list of people found in an inbox, on LinkedIn or in an ad campaign). Duplicates are skipped and channel/campaign/priority tags are filled automatically.",
  inputSchema: {
    leads: z
      .array(z.object(leadInputSchema))
      .min(1)
      .max(50)
      .describe("The people/companies to add. Company name is required per lead."),
    source: z
      .enum(["email", "linkedin", "ads", "referral", "csv"])
      .optional()
      .describe("Channel tag applied to every lead that has no source of its own."),
    campaign: z
      .string()
      .optional()
      .describe("Campaign tag applied to every lead that has no campaign of its own."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const added: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const raw of input.leads as LeadInput[]) {
      const lead: LeadInput = {
        ...raw,
        source: raw.source ?? input.source,
        campaign: raw.campaign ?? input.campaign,
      };
      if (!lead.company?.trim()) {
        failed.push("(missing company)");
        continue;
      }
      const existing = await findExistingLead(supabase, lead);
      if (existing) {
        skipped.push(`${lead.company} (already in hub)`);
        continue;
      }

      const payload = normalizeLead(lead, userId);
      const { error } = await supabase.from("leads").insert(payload);
      if (error) failed.push(`${lead.company}: ${error.message}`);
      else added.push(lead.company);
    }

    const lines = [
      `Added ${added.length} lead(s)${added.length ? `: ${added.join(", ")}` : ""}`,
      skipped.length ? `Skipped ${skipped.length}: ${skipped.join(", ")}` : "",
      failed.length ? `Failed: ${failed.join("; ")}` : "",
    ].filter(Boolean);

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { added, skipped, failed },
    };
  },
});
