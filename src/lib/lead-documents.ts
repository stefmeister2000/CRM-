import { supabase } from "@/integrations/supabase/client";

export const DOCUMENT_BUCKET = "lead-documents";
export async function listLeadDocuments(id: string) {
  const groups = await Promise.all(
    (["quote", "contract"] as const).map(async (category) => {
      const rows = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .list(`${id}/${category}`, {
            limit: 100,
            offset,
            sortBy: { column: "created_at", order: "desc" },
          });
        if (error) throw error;
        rows.push(
          ...data
            .filter((row) => row.id)
            .map((row) => ({ ...row, category, path: `${id}/${category}/${row.name}` })),
        );
        if (data.length < 100) return rows;
      }
    }),
  );
  return groups.flat().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}
