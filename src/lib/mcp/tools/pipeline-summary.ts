import { defineTool } from "../tool";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "pipeline_summary",
  title: "Pipeline summary",
  description:
    "Summarise the sales pipeline: leads per stage, leads per channel, open value and won value.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("leads").select("stage, source, value_estimate");
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const rows = data ?? [];
    const byStage: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let openValue = 0;
    let wonValue = 0;
    for (const row of rows) {
      byStage[row.stage] = (byStage[row.stage] ?? 0) + 1;
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      const value = row.value_estimate ?? 0;
      if (row.stage === "won") wonValue += value;
      else if (row.stage !== "lost") openValue += value;
    }
    const summary = {
      total_leads: rows.length,
      leads_per_stage: byStage,
      leads_per_channel: bySource,
      open_value_eur: openValue,
      won_value_eur: wonValue,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
