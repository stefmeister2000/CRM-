import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase, isDatabaseConfigured } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!isDatabaseConfigured) throw redirect({ to: "/auth" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (!roles || roles.length === 0) {
      const fullName = (data.user.user_metadata?.["full_name"] as string | undefined) ?? null;
      await supabase
        .from("profiles")
        .upsert(
          { id: data.user.id, email: data.user.email ?? null, full_name: fullName },
          { onConflict: "id", ignoreDuplicates: true },
        );
      if (data.user.email) {
        const { data: existingRequest } = await supabase
          .from("account_requests")
          .select("id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (!existingRequest) {
          await supabase.from("account_requests").insert({
            user_id: data.user.id,
            email: data.user.email,
            full_name: fullName,
          });
        }
      }
      throw redirect({ to: "/pending" });
    }
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
