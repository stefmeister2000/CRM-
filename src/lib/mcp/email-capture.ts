import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const emailCaptureSchema = z.object({
  company: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional(),
  contact_name: z.string().trim().max(200).optional(),
  job_title: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(60).optional(),
  linkedin_url: z.string().trim().max(500).optional(),
  website: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  source: z.enum(["email", "linkedin", "ads", "referral", "csv", "website"]).default("email"),
  campaign: z.string().trim().max(200).optional(),
  subject: z.string().trim().min(1).max(500),
  draft: z
    .string()
    .min(1)
    .max(100_000)
    .describe("Email body to save. This tool does not send email."),
  sent: z
    .boolean()
    .default(false)
    .describe("Only true after confirmed successful sending; otherwise save as a draft."),
});

// ILIKE wildcards must not turn an exact identity lookup into a broad match.
export const exactPattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function captureEmail(db: SupabaseClient, raw: unknown, userId: string) {
  const input = emailCaptureSchema.parse(raw);
  const { subject, draft, sent, ...contact } = input;
  let leadId: string | null = null;
  let created = false;
  for (const [field, value] of [
    ["email", input.email],
    ["company", input.company],
  ] as const) {
    if (!value || leadId) continue;
    const { data, error } = await db
      .from("leads")
      .select("id")
      .ilike(field, exactPattern(value))
      .limit(1);
    if (error) throw new Error(`Lead lookup failed: ${error.message}`);
    leadId = data?.[0]?.id ?? null;
  }
  if (!leadId) {
    const { data, error } = await db
      .from("leads")
      .insert({
        ...contact,
        email: input.email?.toLowerCase() ?? null,
        stage: sent ? "contacted" : "new",
        owner_id: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create the lead.");
    leadId = data.id;
    created = true;
  }
  const now = new Date().toISOString();
  const { error: activityError } = await db.from("activities").insert({
    lead_id: leadId,
    channel: "email",
    direction: "outbound",
    subject: sent ? subject : `DRAFT: ${subject}`,
    body: draft,
    occurred_at: now,
    user_id: userId,
  });
  if (activityError)
    throw new Error(`Lead ${leadId} exists, but the email was not saved: ${activityError.message}`);
  if (sent) {
    const { error } = await db.from("leads").update({ last_touch_at: now }).eq("id", leadId);
    if (error)
      throw new Error(
        `Email saved for lead ${leadId}, but the contact date was not updated: ${error.message}`,
      );
    if (!created) {
      const { error: stageError } = await db
        .from("leads")
        .update({ stage: "contacted" })
        .eq("id", leadId)
        .eq("stage", "new");
      if (stageError)
        throw new Error(
          `Email saved for lead ${leadId}, but its stage was not updated: ${stageError.message}`,
        );
    }
  }
  return { leadId, created, emailStatus: sent ? "sent" : "draft" };
}
