import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

const VERKOOP_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
/** The credential, never a caller-supplied company ID, determines the destination. */
export async function resolveInboundCompany(
  admin: SupabaseClient<Database>,
  token: string,
  legacyToken?: string,
) {
  if (!token || token.length > 512) return null;
  const { data, error } = await admin
    .from("app_settings")
    .select("company_id")
    .eq("key", "inbound_lead_token")
    .eq("value", token)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.company_id;
  if (!legacyToken || token !== legacyToken) return null;
  // A rotated Verkoop token disables its old environment fallback, as before.
  const fallback = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "inbound_lead_token")
    .eq("company_id", VERKOOP_COMPANY_ID)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data ? null : VERKOOP_COMPANY_ID;
}
