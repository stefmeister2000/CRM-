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
    const { error } = await context.supabase.rpc("decide_company_request", {
      _request_id: data.requestId,
      _user_id: data.userId,
      _approve: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const declineAccountRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_company_request", {
      _request_id: data.requestId,
      _user_id: data.userId,
      _approve: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
