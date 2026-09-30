import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Users, LogOut, Settings, FileText, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { labelFor, ROLES } from "@/lib/sales";
import { useLanguage } from "@/hooks/use-language";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/prospectflow", label: "Prospectflow", icon: GitBranch },
  { to: "/documents", label: "Offertes & contracten", icon: FileText },

  { to: "/settings", label: "Instellingen", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const { language } = useLanguage();
  const nl = language === "nl";
  const navLabel = (label: string) =>
    nl
      ? label
      : ({
          Instellingen: "Settings",
          Prospectflow: "Prospect flow",
          "Offertes & contracten": "Quotes & contracts",
        }[label] ?? label);
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
    <div className="min-h-screen bg-background">
      <aside
        aria-label={nl ? "Zijbalk" : "Sidebar"}
        className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r bg-card px-2 py-6 md:w-60 md:px-5"
      >
        <Link to="/dashboard" aria-label="Sales CRM" className="flex items-center gap-3 px-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">
            S
          </span>
          <span className="hidden md:block">
            <span className="block text-lg font-semibold">Sales CRM</span>
            <span className="text-[9px] uppercase tracking-[.18em] text-muted-foreground">
              Sales workspace
            </span>
          </span>
        </Link>
        <nav
          aria-label={nl ? "Hoofdnavigatie" : "Main navigation"}
          className="mt-10 flex flex-1 flex-col gap-2 overflow-y-auto"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={navLabel(item.label)}
              aria-label={navLabel(item.label)}
              className="relative flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary md:justify-start [&.active]:bg-primary/10 [&.active]:font-semibold [&.active]:text-primary"
            >
              <item.icon className="size-5 shrink-0" />
              <span className="hidden md:inline">
                {!nl && item.to === "/settings"
                  ? "Settings"
                  : !nl && item.to === "/documents"
                    ? "Quotes & contracts"
                    : !nl && item.to === "/prospectflow"
                      ? "Prospect flow"
                      : item.label}
              </span>
              {item.to === "/settings" && pendingCount > 0 && (
                <Badge className="absolute right-0 top-0 min-w-5 justify-center px-1 md:static md:ml-auto">
                  {pendingCount}
                </Badge>
              )}
            </Link>
          ))}
        </nav>
        <div className="space-y-4 border-t pt-5">
          <div title={user?.fullName ?? "Account"} className="flex items-center gap-3 px-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
              {user?.fullName?.slice(0, 1) ?? "S"}
            </span>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium">{user?.fullName ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {user?.roles.map((r) => labelFor(ROLES, r)).join(" · ") || "Sales rep"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-center gap-3 px-2 md:justify-start"
            onClick={signOut}
            aria-label={nl ? "Afmelden" : "Sign out"}
          >
            <LogOut className="size-4 shrink-0" />
            <span className="hidden md:inline">{nl ? "Afmelden" : "Sign out"}</span>
          </Button>
        </div>
      </aside>
      <main className="ml-16 min-w-0 px-4 py-8 md:ml-60 md:px-8 lg:px-10">
        <div className="mx-auto max-w-[1500px]">{children}</div>
      </main>
    </div>
  );
}
