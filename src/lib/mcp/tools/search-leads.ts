import { defineTool } from "../tool";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_leads",
  title: "Search leads",
  description:
    "Search the shared Sales CRM lead database by company, contact, email, city or campaign, optionally filtered by source or stage.",
  inputSchema: {
    query: z.string().optional().describe("Free text search term."),
    source: z.string().optional().describe("Filter by lead source."),
    stage: z.string().optional().describe("Filter by pipeline stage."),
    limit: z.number().optional().describe("Max rows to return, default 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, source, stage, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let request = supabase
      .from("leads")
      .select(
        "id, company, contact_name, email, phone, city, source, stage, campaign, priority, value_estimate, owner_id, last_touch_at",
      )
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));

    if (query) {
      const term = `%${query}%`;
      request = request.or(
        `company.ilike.${term},contact_name.ilike.${term},email.ilike.${term},city.ilike.${term},campaign.ilike.${term}`,
      );
    }
    if (source) request = request.eq("source", source as never);
    if (stage) request = request.eq("stage", stage as never);

    const { data, error } = await request;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
