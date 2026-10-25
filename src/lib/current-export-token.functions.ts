import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/inbound-token.functions";
import { CURRENT_EXPORT_SETTING_KEY, generateCurrentExportToken } from "@/lib/current-export";

// Same flow and permission checks as the website intake token: admins of the
// selected company can see, copy and rotate the reporting token for Current.
export const getCurrentExportToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const workspaceId = context.companyId;
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) {
      return {
        token: null as string | null,
        updatedAt: null as string | null,
        workspaceId,
        serverConfigured: false,
      };
    }
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("company_id", workspaceId)
      .eq("key", CURRENT_EXPORT_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      token: (data?.value || null) as string | null,
      updatedAt: (data?.value ? data.updated_at : null) as string | null,
      workspaceId,
      serverConfigured: true,
    };
  });

export const rotateCurrentExportToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = generateCurrentExportToken();
    const updatedAt = new Date().toISOString();
    const { error } = await context.supabase.from("app_settings").upsert(
      {
        key: CURRENT_EXPORT_SETTING_KEY,
        company_id: context.companyId,
        value: token,
        updated_at: updatedAt,
        updated_by: context.userId,
      },
      { onConflict: "company_id,key" },
    );
    if (error) throw new Error(error.message);
    return { token, updatedAt };
  });
