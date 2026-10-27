import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { CURRENT_EXPORT_SETTING_KEY, generateCurrentExportToken } from "./current-export.ts";

// One-click link with Current: an admin approves in the CRM, then Current's server exchanges a
// single-use code for the workspace ID and reporting token. The token never passes through a browser.

export const CURRENT_CONNECT_CODE_KEY = "current_connect_code";
export const CURRENT_CONNECT_PATH = "/current/connect";
export const CURRENT_EXCHANGE_PATH = "/api/integrations/current/exchange";
export const CURRENT_CONNECT_CODE_SECONDS = 300;
// Only Current's own callback ever receives a code.
export const CURRENT_DASHBOARD_ORIGIN = "https://perfomance.verkoop.studio";
const STATE_PATTERN = /^[a-f0-9]{32}$/;
const CODE_PATTERN = /^[a-f0-9]{64}$/;

export const validConnectState = (state: unknown): state is string =>
  typeof state === "string" && STATE_PATTERN.test(state);

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Current's callback with either the single-use code or the cancellation. */
export function currentCallbackUrl(
  state: string,
  result: { code: string } | { error: "denied" },
  origin = CURRENT_DASHBOARD_ORIGIN,
) {
  const url = new URL("/api/crm/callback", origin);
  url.searchParams.set("state", state);
  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);
  return url.toString();
}

/**
 * Makes sure the company has a reporting token (an existing one keeps working, so a pasted
 * connection is not broken) and stores the hash of a new single-use code, valid for 5 minutes.
 */
export async function createCurrentConnectCode(
  db: SupabaseClient<Database>,
  companyId: string,
  userId: string,
  now: Date = new Date(),
) {
  const stamp = now.toISOString();
  const { data: existing, error } = await db
    .from("app_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", CURRENT_EXPORT_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing?.value) {
    const { error: tokenError } = await db.from("app_settings").upsert(
      {
        key: CURRENT_EXPORT_SETTING_KEY,
        company_id: companyId,
        value: generateCurrentExportToken(),
        updated_at: stamp,
        updated_by: userId,
      },
      { onConflict: "company_id,key" },
    );
    if (tokenError) throw new Error(tokenError.message);
  }
  const code = generateCurrentExportToken();
  const expires = now.getTime() + CURRENT_CONNECT_CODE_SECONDS * 1000;
  const { error: codeError } = await db.from("app_settings").upsert(
    {
      key: CURRENT_CONNECT_CODE_KEY,
      company_id: companyId,
      value: `${await sha256Hex(code)}:${expires}`,
      updated_at: stamp,
      updated_by: userId,
    },
    { onConflict: "company_id,key" },
  );
  if (codeError) throw new Error(codeError.message);
  return code;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const currentExchangeMethodNotAllowed = () =>
  new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST" },
  });

export type CurrentExchangeDependencies = {
  configured: boolean;
  admin: () => Promise<SupabaseClient<Database>>;
  now?: () => Date;
};

/** POST {code} from Current's server: returns the workspace ID and reporting token once. */
export async function handleCurrentExchangeRequest(
  request: Request,
  { configured, admin, now = () => new Date() }: CurrentExchangeDependencies,
) {
  if (!configured) return json({ error: "Current connect is not configured yet." }, 503);
  let code: unknown;
  try {
    code = ((await request.json()) as { code?: unknown } | null)?.code;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (typeof code !== "string" || !CODE_PATTERN.test(code))
    return json({ error: "Invalid code" }, 400);
  try {
    const db = await admin();
    const hash = await sha256Hex(code);
    const { data, error } = await db
      .from("app_settings")
      .select("company_id, value")
      .eq("key", CURRENT_CONNECT_CODE_KEY)
      .like("value", `${hash}:%`)
      .limit(2);
    if (error) throw error;
    if (data?.length !== 1 || !data[0]) return json({ error: "Invalid code" }, 400);
    const row = data[0];
    // Single use: the code is removed before anything is returned; a concurrent second use deletes nothing.
    const { data: removed, error: deleteError } = await db
      .from("app_settings")
      .delete()
      .eq("company_id", row.company_id)
      .eq("key", CURRENT_CONNECT_CODE_KEY)
      .eq("value", row.value)
      .select("company_id");
    if (deleteError) throw deleteError;
    if (!removed?.length) return json({ error: "Invalid code" }, 400);
    const expires = Number(String(row.value).split(":")[1]);
    if (!Number.isFinite(expires) || expires < now().getTime())
      return json({ error: "Code expired" }, 400);
    const { data: token, error: tokenError } = await db
      .from("app_settings")
      .select("value")
      .eq("company_id", row.company_id)
      .eq("key", CURRENT_EXPORT_SETTING_KEY)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!token?.value) return json({ error: "No reporting token" }, 409);
    return json({ workspaceId: row.company_id, token: token.value });
  } catch {
    return json({ error: "Could not complete the link." }, 503);
  }
}
