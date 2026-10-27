import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/inbound-token.functions";
import {
  CURRENT_DASHBOARD_ORIGIN,
  createCurrentConnectCode,
  currentCallbackUrl,
  validConnectState,
} from "@/lib/current-connect";

// "Koppelen" on the Current connect page: admins of the selected company only.
export const approveCurrentConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const state = (data as { state?: unknown } | null)?.state;
    if (!validConnectState(state))
      throw new Error("Deze koppeling is verlopen. Start opnieuw vanuit Current.");
    return { state };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"])
      throw new Error("De serververbinding met de database moet nog worden ingesteld.");
    const code = await createCurrentConnectCode(
      context.supabase,
      context.companyId,
      context.userId,
    );
    return { redirect: currentCallbackUrl(data.state, { code }, CURRENT_DASHBOARD_ORIGIN) };
  });
