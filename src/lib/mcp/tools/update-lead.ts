import { defineTool } from "../tool";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const STAGES = ["new", "contacted", "engaged", "meeting", "proposal", "won", "lost"] as const;

export default defineTool({
  name: "update_lead",
  title: "Update lead",
  description: "Update an existing lead: pipeline stage, importance, estimated value or notes.",
  inputSchema: {
    lead_id: z.string().describe("Lead id from search_leads."),
    stage: z.enum(STAGES).optional(),
    priority: z.number().optional().describe("Importance 1-5."),
    value_estimate: z.number().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id, ...patch }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const fields = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(fields).length === 0) {
      return { content: [{ type: "text", text: "Nothing to update." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leads")
      .update(fields)
      .eq("id", lead_id)
      .select()
      .single();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Updated ${data.company}.` }],
      structuredContent: { lead: data },
    };
  },
});
