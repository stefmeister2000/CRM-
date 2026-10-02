import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/sales";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  team: string | null;
  roles: Role[];
  isManager: boolean;
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;

      // Make sure the signed-in person exists in the team directory.
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name:
            (user.user_metadata?.["full_name"] as string | undefined) ?? user.email ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("full_name, team, email").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const roles = (roleRows ?? []).map((r) => r.role as Role);
      return {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        fullName: profile?.full_name ?? user.email ?? null,
        team: profile?.team ?? null,
        roles,
        isManager: roles.includes("admin") || roles.includes("team_leader"),
      };
    },
    staleTime: 60_000,
  });
}
