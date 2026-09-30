import { defineTool } from "../tool";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { findExistingLead, leadInputSchema, normalizeLead, type LeadInput } from "../leadInput";

export default defineTool({
  name: "create_lead",
  title: "Create lead",
  description:
    "Add one new B2B lead to the Sales CRM, owned by the signed-in user. Always tag the channel (source) and campaign; the tool fills sensible tags, priority when you leave them out. It skips contacts that already exist in the CRM.",
  inputSchema: {
    ...leadInputSchema,
    allow_duplicate: z
      .boolean()
      .optional()
      .describe("Set true to add the lead even if a matching one already exists."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { allow_duplicate, ...lead } = input as LeadInput & { allow_duplicate?: boolean };
    const supabase = supabaseForUser(ctx);

    if (!allow_duplicate) {
      const existing = await findExistingLead(supabase, lead);
      if (existing) {
        return {
          content: [
            {
              type: "text",
              text: `Already in the hub: ${existing.company} (${existing.id}). Use update_lead or log_outreach instead, or pass allow_duplicate.`,
            },
          ],
          structuredContent: { duplicate: existing },
        };
      }
    }

    const payload = normalizeLead(lead, ctx.getUserId()!);

    const { data, error } = await supabase.from("leads").insert(payload).select().single();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [
        {
          type: "text",
          text: `Lead created: ${data.company} — ${data.source} / ${data.campaign}, stage ${data.stage}, priority ${data.priority}.`,
        },
      ],
      structuredContent: { lead: data },
    };
  },
});
