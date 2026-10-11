import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

export type Company = {
  id: string;
  name: string;
  role: "admin" | "team_leader" | "rep";
  platform_owner: boolean;
};
export const VERKOOP_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
let activeCompanyId: string | null = null;
let activeUserId: string | null = null;
export const getCompanyId = () => activeCompanyId;
export function companyHeaders(): Record<string, string> {
  return activeCompanyId ? { "x-crm-company-id": activeCompanyId } : {};
}
export function chooseCompany(companies: Company[], preferred: string | null) {
  return (
    companies.find((c) => c.id === preferred) ??
    companies.find((c) => c.id === VERKOOP_COMPANY_ID) ??
    companies[0]
  );
}
export function rememberCompany(userId: string, companyId: string) {
  try {
    window.sessionStorage.setItem(`crm-company:${userId}`, companyId);
  } catch {
    /* Selection is optional when storage is blocked. */
  }
}
export function resetCompanyContext() {
  activeCompanyId = null;
  activeUserId = null;
}
export async function initializeCompany(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client.rpc("list_my_companies");
  if (error) throw new Error("Bedrijven konden niet worden geladen. Probeer opnieuw.");
  let preferred = activeUserId === userId ? activeCompanyId : null;
  try {
    preferred = window.sessionStorage.getItem(`crm-company:${userId}`) ?? preferred;
  } catch {
    /* Use the current tab's in-memory selection. */
  }
  const requested =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("company")
      : null;
  const selected = chooseCompany(data ?? [], requested ?? preferred);
  if (selected) rememberCompany(userId, selected.id);
  activeUserId = userId;
  activeCompanyId = selected?.id ?? null;
  return selected;
}
export function switchCompany(userId: string, companyId: string) {
  rememberCompany(userId, companyId);
  // A full navigation discards cached queries, drafts and in-flight UI updates from the old company.
  // Keep the old in-memory header until navigation, so a pending mutation cannot change destination.
  window.location.assign(`/settings?company=${encodeURIComponent(companyId)}`);
}
