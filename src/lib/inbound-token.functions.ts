import { VERKOOP_COMPANY_ID } from "@/lib/company-context";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const SETTING_KEY = "inbound_lead_token";

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Alleen beheerders kunnen het token beheren.");
}

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const getInboundToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) {
      return {
        token: null as string | null,
        updatedAt: null as string | null,
        source: "none",
        serverConfigured: false,
      };
    }
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.value) {
      return {
        token: data.value,
        updatedAt: data.updated_at as string | null,
        source: "app",
        serverConfigured: true,
      };
    }
    const envToken =
      context.companyId === VERKOOP_COMPANY_ID ? process.env["INBOUND_LEAD_TOKEN"] : undefined;
    return {
      token: null as string | null,
      updatedAt: null as string | null,
      source: envToken ? "secret" : "none",
      serverConfigured: true,
    };
  });

export const rotateInboundToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = newToken();
    const { error } = await context.supabase.from("app_settings").upsert(
      {
        key: SETTING_KEY,
        company_id: context.companyId,
        value: token,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "company_id,key" },
    );
    if (error) throw new Error(error.message);
    return { token };
  });
