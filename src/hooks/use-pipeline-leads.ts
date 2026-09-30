import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export const pipelineQueryKey = ["leads", "dashboard-pipeline"];
export function usePipelineLeads() {
  return useQuery({
    queryKey: pipelineQueryKey,
    queryFn: async () => {
      const rows: Lead[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
    refetchInterval: 30_000,
  });
}
