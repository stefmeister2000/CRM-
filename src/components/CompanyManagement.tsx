import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, switchCompany } from "@/lib/company-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function companyInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase();
}

export function useCompanies() {
  return useQuery({
    queryKey: ["my-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_companies");
      if (error) throw error;
      return data;
    },
  });
}
export function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const { data: companies = [] } = useCompanies();
  const { data: me } = useCurrentUser();
  const { language } = useLanguage();
  const nl = language === "nl";
  const current = companies.find((company) => company.id === getCompanyId());
  return (
    <div className={compact ? "min-w-0 flex-1" : "mt-6"}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${nl ? "Bedrijf wisselen" : "Switch company"}${current ? `: ${current.name}` : ""}`}
            disabled={!me || !companies.length}
            className={`group flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-secondary/30 text-left transition-colors hover:border-primary/25 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 data-[state=open]:border-primary/25 data-[state=open]:bg-secondary/70 ${compact ? "min-h-11 px-2.5 py-2" : "p-2.5"}`}
          >
            <span
              aria-hidden="true"
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary ${compact ? "hidden sm:flex" : ""}`}
            >
              {current ? companyInitials(current.name) : <Building2 className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${compact ? "hidden" : ""}`}
              >
                {nl ? "Werkruimte" : "Workspace"}
              </span>
              <span
                className="block truncate text-[13px] font-semibold leading-5"
                title={current?.name}
              >
                {current?.name ?? (nl ? "Laden…" : "Loading…")}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={compact ? "end" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className="w-72 max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5 shadow-lg"
        >
          <DropdownMenuLabel className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
            {nl ? "Bedrijf wisselen" : "Switch company"}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current?.id ?? ""}
            onValueChange={(id) => me && id !== current?.id && switchCompany(me.id, id)}
          >
            {companies.map((company) => (
              <DropdownMenuRadioItem
                key={company.id}
                value={company.id}
                textValue={company.name}
                className="min-h-12 cursor-pointer gap-3 rounded-lg py-2 pl-2.5 pr-8 data-[state=checked]:bg-secondary/70 [&>span.absolute]:right-3 [&>span.absolute]:left-auto"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary"
                >
                  {companyInitials(company.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={company.name}>
                    {company.name}
                  </span>
                  {company.id === current?.id && (
                    <span className="block text-[11px] text-muted-foreground">
                      {nl ? "Huidige werkruimte" : "Current workspace"}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {current?.role === "admin" && (
            <>
              <DropdownMenuSeparator className="mx-1 my-1.5" />
              <DropdownMenuItem
                asChild
                className="min-h-10 cursor-pointer rounded-lg px-2.5 text-muted-foreground"
              >
                <Link to="/settings" hash="companies">
                  <Settings2 aria-hidden="true" />
                  {nl ? "Bedrijven beheren" : "Manage companies"}
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function CompanyManagement() {
  const { data: companies = [], error } = useCompanies();
  const { data: me } = useCurrentUser();
  const { language } = useLanguage();
  const nl = language === "nl";
  const [name, setName] = useState("");
  const current = companies.find((company) => company.id === getCompanyId());
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_crm_company", { _name: name.trim() });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      if (me) switchCompany(me.id, id);
    },
  });
  return (
    <Card id="companies" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5" />
          {nl ? "Bedrijven" : "Companies"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <div>
          <h3 className="font-semibold">{current?.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {nl
              ? "Je werkt in dit bedrijf. Leads, teamleden, imports en websitekoppelingen horen bij dit bedrijf."
              : "You are working in this company. Its leads, team, imports and website connections are kept together."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              disabled={!me || create.isPending}
              onClick={() => me && company.id !== current?.id && switchCompany(me.id, company.id)}
              aria-current={company.id === current?.id ? "true" : undefined}
              className={`rounded-xl border p-4 text-left transition-colors hover:bg-secondary ${company.id === current?.id ? "border-primary bg-primary/5" : ""}`}
            >
              <span className="block font-medium break-words">{company.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {company.id === current?.id
                  ? nl
                    ? "Huidig bedrijf"
                    : "Current company"
                  : nl
                    ? "Open bedrijf"
                    : "Open company"}
              </span>
            </button>
          ))}
        </div>
        {current?.platform_owner && (
          <form
            className="space-y-3 border-t pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!create.isPending && name.trim()) create.mutate();
            }}
          >
            <Label htmlFor="company-name">{nl ? "Nieuw bedrijf toevoegen" : "Add a company"}</Label>
            <p className="text-sm text-muted-foreground">
              {nl
                ? "Maak een eigen werkruimte voor een ander bedrijf. Daarna kun je hieronder hun team uitnodigen."
                : "Create a workspace for another company. Then invite its team below."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="company-name"
                placeholder={nl ? "Bedrijfsnaam" : "Company name"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
                disabled={create.isPending}
              />
              <Button disabled={create.isPending || !name.trim()}>
                <Plus className="size-4" />
                {create.isPending
                  ? nl
                    ? "Aanmaken…"
                    : "Creating…"
                  : nl
                    ? "Bedrijf aanmaken"
                    : "Create company"}
              </Button>
            </div>
            {create.error && (
              <p role="alert" className="text-sm text-destructive">
                {create.error.message}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
export function PendingCompanyInvitations() {
  const { language } = useLanguage();
  const nl = language === "nl";
  const queryClient = useQueryClient();
  const { data: invitations = [], error } = useQuery({
    queryKey: ["company-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_company_invitation", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-invitations"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!invitations.length && !error) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{nl ? "Openstaande uitnodigingen" : "Pending invitations"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        )}
        {invitations.map((invite) => (
          <div
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="break-all text-sm font-medium">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                {invite.role} ·{" "}
                {Date.parse(invite.expires_at) <= Date.now()
                  ? nl
                    ? "Verlopen — maak een nieuwe link"
                    : "Expired — create a new link"
                  : `${nl ? "Geldig tot" : "Expires"} ${new Date(invite.expires_at).toLocaleDateString(nl ? "nl-BE" : "en-GB")}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(invite.id)}
            >
              {nl ? "Intrekken" : "Revoke"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
