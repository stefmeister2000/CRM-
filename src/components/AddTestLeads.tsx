import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/hooks/use-language";

const CAMPAIGN = "CRM test leads · sample batch 1";
const SAMPLES = [
  {
    company: "TEST · Northstar Studio",
    contact_name: "Alex Demo",
    email: "alex.demo@example.com",
    source: "email" as const,
    city: "Brussels",
  },
  {
    company: "TEST · Brightfield Consulting",
    contact_name: "Sam Demo",
    email: "sam.demo@example.com",
    source: "website" as const,
    city: "Antwerp",
  },
  {
    company: "TEST · Blue Horizon Labs",
    contact_name: "Robin Demo",
    email: "robin.demo@example.com",
    source: "linkedin" as const,
    city: "Leuven",
  },
  {
    company: "TEST · Cedar & Co",
    contact_name: "Jamie Demo",
    email: "jamie.demo@example.com",
    source: "referral" as const,
    city: "Mechelen",
  },
  {
    company: "TEST · Summit Digital",
    contact_name: "Taylor Demo",
    email: "taylor.demo@example.com",
    source: "ads" as const,
    city: "Ghent",
  },
];

export function AddTestLeads() {
  const { data: user } = useCurrentUser();
  const { language } = useLanguage();
  const nl = language === "nl";
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error(nl ? "Meld je eerst aan." : "Sign in first.");
      const { data: existing, error } = await supabase
        .from("leads")
        .select("company")
        .eq("campaign", CAMPAIGN);
      if (error) throw error;
      const known = new Set(existing.map((lead) => lead.company));
      const rows = SAMPLES.filter((lead) => !known.has(lead.company)).map((lead) => ({
        ...lead,
        stage: "new" as const,
        priority: 3,
        campaign: CAMPAIGN,
        owner_id: user.id,
        created_by: user.id,
        notes:
          "TEST DATA: fictional company and contact for CRM testing. No email was sent and no website form was submitted.",
      }));
      if (!rows.length) return 0;
      const { error: insertError } = await supabase.from("leads").insert(rows);
      if (insertError) throw insertError;
      return rows.length;
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        count
          ? nl
            ? `${count} testleads toegevoegd`
            : `Added ${count} test leads`
          : nl
            ? "De testleads staan er al."
            : "The test leads already exist.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button variant="outline" disabled={!user?.id || add.isPending} onClick={() => add.mutate()}>
      {add.isPending
        ? nl
          ? "Toevoegen…"
          : "Adding…"
        : nl
          ? "Testleads toevoegen"
          : "Add test leads"}
    </Button>
  );
}
