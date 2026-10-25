import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { leadCategoryLabel } from "./lead-categories.ts";

// Read-only reporting export for Current (the marketing dashboard).
// The contract is fixed on Current's side: keep field names, limits and status codes stable.

export const CURRENT_EXPORT_SETTING_KEY = "current_export_token";
export const CURRENT_EXPORT_PATH = "/api/integrations/current/export";
export const CURRENT_EXPORT_MAX_LEADS = 1000;
const MAX_CAMPAIGN_LENGTH = 200;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

// Only reporting columns are ever read; contact details never leave the database.
const EXPORT_LEAD_COLUMNS =
  "id, company_id, created_at, stage, value_estimate, source, campaign, deleted_at";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type CurrentExportLeadRow = Pick<
  LeadRow,
  | "id"
  | "company_id"
  | "created_at"
  | "stage"
  | "value_estimate"
  | "source"
  | "campaign"
  | "deleted_at"
>;

export type CurrentExportLead = {
  id: string;
  createdAt: string;
  stage: LeadRow["stage"];
  valueEstimate: number | null;
  source: LeadRow["source"];
  campaign: string | null;
  category: string | null;
  deletedAt: string | null;
};

export type CurrentExport = {
  schemaVersion: 1;
  complete: boolean;
  workspaceId: string;
  currency: "EUR";
  timezone: "Europe/Brussels";
  generatedAt: string;
  leads: CurrentExportLead[];
};

/** 32 random bytes as 64 lowercase hex characters. */
export function generateCurrentExportToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the normalized token from `Authorization: Bearer <64 hex>`, or null. */
export function currentExportBearerToken(header: string | null) {
  const token = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header ?? "")?.[1];
  return token && TOKEN_PATTERN.test(token) ? token.toLowerCase() : null;
}

/** The token, never a caller-supplied company ID, determines the workspace. */
export async function resolveCurrentExportCompany(admin: SupabaseClient<Database>, token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await admin
    .from("app_settings")
    .select("company_id")
    .eq("key", CURRENT_EXPORT_SETTING_KEY)
    .eq("value", token)
    .limit(2);
  if (error) throw error;
  // A token must identify exactly one company; anything else is rejected.
  return data?.length === 1 && data[0] ? data[0].company_id : null;
}

const isoTimestamp = (value: string) => new Date(value).toISOString();

function exportValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function exportCampaign(value: string | null) {
  if (value === null) return null;
  const characters = Array.from(value);
  return characters.length > MAX_CAMPAIGN_LENGTH
    ? characters.slice(0, MAX_CAMPAIGN_LENGTH).join("")
    : value;
}

/** Maps the newest-first lead rows of one company to Current's export contract. */
export function buildCurrentExport(
  workspaceId: string,
  rows: readonly CurrentExportLeadRow[],
  now: Date = new Date(),
): CurrentExport {
  const seen = new Set<string>();
  const leads: CurrentExportLead[] = [];
  let complete = true;
  for (const row of rows) {
    if (row.company_id !== workspaceId || seen.has(row.id)) continue;
    if (leads.length === CURRENT_EXPORT_MAX_LEADS) {
      complete = false;
      break;
    }
    seen.add(row.id);
    leads.push({
      id: row.id,
      createdAt: isoTimestamp(row.created_at),
      stage: row.stage,
      valueEstimate: exportValue(row.value_estimate),
      source: row.source,
      campaign: exportCampaign(row.campaign),
      category: leadCategoryLabel(row),
      deletedAt: row.deleted_at ? isoTimestamp(row.deleted_at) : null,
    });
  }
  return {
    schemaVersion: 1,
    complete,
    workspaceId,
    currency: "EUR",
    timezone: "Europe/Brussels",
    generatedAt: now.toISOString(),
    leads,
  };
}

/** Loads the newest leads (including soft-deleted ones) of one company. */
export async function loadCurrentExport(
  admin: SupabaseClient<Database>,
  workspaceId: string,
  now: Date = new Date(),
) {
  const { data, error } = await admin
    .from("leads")
    .select(EXPORT_LEAD_COLUMNS)
    .eq("company_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // One extra row reveals whether the export is truncated.
    .limit(CURRENT_EXPORT_MAX_LEADS + 1);
  if (error) throw error;
  return buildCurrentExport(workspaceId, data ?? [], now);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export const currentExportMethodNotAllowed = () =>
  json({ error: "Method not allowed" }, 405, { Allow: "GET, HEAD" });

export type CurrentExportDependencies = {
  configured: boolean;
  admin: () => Promise<SupabaseClient<Database>>;
  now?: () => Date;
};

export async function handleCurrentExportRequest(
  request: Request,
  { configured, admin, now = () => new Date() }: CurrentExportDependencies,
) {
  if (!configured) return json({ error: "Current export is not configured yet." }, 503);
  const token = currentExportBearerToken(request.headers.get("authorization"));
  if (!token) return json({ error: "Invalid token" }, 401, { "WWW-Authenticate": "Bearer" });

  let client: SupabaseClient<Database>;
  let workspaceId: string | null;
  try {
    client = await admin();
    workspaceId = await resolveCurrentExportCompany(client, token);
  } catch {
    return json({ error: "Could not load the Current connection settings." }, 503);
  }
  if (!workspaceId) return json({ error: "Invalid token" }, 401, { "WWW-Authenticate": "Bearer" });

  try {
    return json(await loadCurrentExport(client, workspaceId, now()));
  } catch {
    return json({ error: "Could not load leads for Current." }, 503);
  }
}
