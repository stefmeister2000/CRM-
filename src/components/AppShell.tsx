import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Users, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { labelFor, ROLES } from "@/lib/sales";
import { LanguageToggle } from "@/hooks/use-language";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/leads", label: "Leads", icon: Users },

  { to: "/settings", label: "Instellingen", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.roles.includes("admin") ?? false;
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["account-requests", "count"],
    enabled: isAdmin,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("account_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="font-display text-xl font-semibold text-primary">Sales CRM</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Sales workspace
            </span>
          </Link>

          <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-2 md:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-primary"
              >
                <item.icon className="size-4" />
                {item.label}
                {item.to === "/settings" && pendingCount > 0 && (
                  <Badge className="min-w-5 justify-center px-1.5">{pendingCount}</Badge>
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto order-2 flex items-center gap-3 md:order-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user?.fullName ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {user?.roles.map((r) => labelFor(ROLES, r)).join(" · ") || "Sales rep"}
              </p>
            </div>
            <LanguageToggle />
            {user?.isManager && <Badge variant="outline">Teamleider</Badge>}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Afmelden">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
