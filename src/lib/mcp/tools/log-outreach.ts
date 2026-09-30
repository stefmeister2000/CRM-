import { defineTool } from "../tool";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const CHANNELS = ["email", "linkedin", "ads", "call", "meeting", "note"] as const;

export default defineTool({
  name: "log_outreach",
  title: "Log outreach",
  description:
    "Log an outreach touch (email, LinkedIn, ads, call, meeting or note) against an existing lead.",
  inputSchema: {
    lead_id: z.string().describe("Lead id from search_leads or create_lead."),
    channel: z.enum(CHANNELS).describe("Outreach channel."),
    direction: z.enum(["outbound", "inbound"]).optional().describe("Defaults to outbound."),
    subject: z.string().optional().describe("Short summary or subject line."),
    body: z.string().optional().describe("Full message or notes."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ lead_id, channel, direction, subject, body }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("activities").insert({
      lead_id,
      channel,
      direction: direction ?? "outbound",
      subject: subject ?? null,
      body: body ?? null,
      occurred_at: nowIso,
      user_id: ctx.getUserId(),
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    await supabase.from("leads").update({ last_touch_at: nowIso }).eq("id", lead_id);
    return { content: [{ type: "text", text: "Outreach logged." }] };
  },
});
