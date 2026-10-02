import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { inviteMember, removeMember } from "./team-management";

const schema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "team_leader", "rep"]),
  team: z.string().trim().max(200).optional(),
});
const requestDecisionSchema = z.object({ requestId: z.string().uuid(), userId: z.string().uuid() });

export const createTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return inviteMember(
      context.supabase,
      supabaseAdmin,
      context.userId,
      data,
      process.env["CRM_PUBLIC_URL"],
    );
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => removeMember(context.supabase, context.userId, data.userId));

export const approveAccountRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminCheckError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (adminCheckError) throw new Error(adminCheckError.message);
    if (!isAdmin) throw new Error("Alleen beheerders kunnen accountaanvragen behandelen.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request, error: requestError } = await supabaseAdmin
      .from("account_requests")
      .select("id, user_id, status")
      .eq("id", data.requestId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request || request.status !== "pending")
      throw new Error("Deze aanvraag is niet meer openstaand.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "rep" }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    const { error: updateError } = await supabaseAdmin
      .from("account_requests")
      .update({
        status: "approved",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

export const declineAccountRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Alleen beheerders kunnen accountaanvragen behandelen.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request, error: requestError } = await supabaseAdmin
      .from("account_requests")
      .select("id, user_id, status")
      .eq("id", data.requestId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request || request.status !== "pending")
      throw new Error("Deze aanvraag is niet meer openstaand.");

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw new Error(deleteError.message);
    const { error: requestDeleteError } = await supabaseAdmin
      .from("account_requests")
      .delete()
      .eq("id", data.requestId);
    if (requestDeleteError) throw new Error(requestDeleteError.message);
    return { ok: true };
  });
