import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, switchCompany } from "@/lib/company-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  return (
    <div className={compact ? "min-w-0 flex-1" : "mt-6 space-y-2"}>
      {!compact && (
        <p className="text-xs font-medium text-muted-foreground">{nl ? "Bedrijf" : "Company"}</p>
      )}
      <select
        aria-label={nl ? "Bedrijf kiezen" : "Select company"}
        value={getCompanyId() ?? ""}
        className="h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-sm font-medium"
        disabled={!me || !companies.length}
        onChange={(event) => me && switchCompany(me.id, event.target.value)}
      >
        {!companies.length && <option value="">{nl ? "Laden…" : "Loading…"}</option>}
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
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
    <Card>
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
