import { ga4Context } from "@/lib/ga4-intake";
import { resolveInboundCompany } from "@/lib/inbound-company";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const exactPattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-inbound-token, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const payloadSchema = z.object({
  ga4: z.unknown().optional(),
  company: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
  linkedinUrl: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(4000).optional(),
  campaign: z.string().trim().max(200).optional(),
  contactType: z.literal("person").optional(),
  submissionId: z.string().uuid().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/inbound-lead")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
          return json({ error: "Website lead intake is not configured yet." }, 503);
        }
        const token =
          request.headers.get("x-inbound-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!token) return json({ error: "Invalid token" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let companyId: string | null;
        try {
          companyId = await resolveInboundCompany(
            supabaseAdmin,
            token,
            process.env["INBOUND_LEAD_TOKEN"],
          );
        } catch {
          return json({ error: "Could not load website connection settings." }, 503);
        }
        if (!companyId) return json({ error: "Invalid token" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }

        const parsed = payloadSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        }
        const { ga4, ...lead } = parsed.data;
        const analytics = ga4Context(ga4);
        const recordAnalytics = async (leadId: string) => {
          if (!analytics) return;
          try {
            const { error } = await supabaseAdmin.rpc("record_ga4_attribution", {
              _company: companyId,
              _lead: leadId,
              _client: analytics.clientId,
              ...(analytics.sessionId ? { _session: analytics.sessionId } : {}),
            });
            if (error) console.error("[ga4] Could not store website attribution");
          } catch {
            console.error("[ga4] Attribution storage unavailable");
          }
        };

        if (lead.contactType === "person") {
          if (!lead.submissionId || (!lead.email && !lead.phone)) {
            return json(
              { error: "Personal leads require a submissionId and email or phone." },
              400,
            );
          }
          const { data, error } = await supabaseAdmin.rpc("ingest_website_contact", {
            _company: companyId,
            _submission_id: lead.submissionId,
            _payload: lead,
          });
          if (error)
            return json(
              { error: "Could not save the website contact. Retry this submission." },
              503,
            );
          return json(data);
        }

        const defaultCampaign = "Website inquiry";

        // Match accounts only inside the company identified by this connection token.
        let existingId: string | null = null;
        if (lead.email) {
          const { data, error } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("company_id", companyId)
            .ilike("email", exactPattern(lead.email))
            .limit(1);
          if (error) return json({ error: "Could not look up the contact." }, 500);
          existingId = data?.[0]?.id ?? null;
        }
        if (!existingId) {
          const { data, error } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("company_id", companyId)
            .ilike("company", exactPattern(lead.company))
            .limit(1);
          if (error) return json({ error: "Could not look up the company." }, 500);
          existingId = data?.[0]?.id ?? null;
        }

        const stamp = new Date().toISOString();
        const noteLine = lead.notes ? `Aanvraag website (${stamp}): ${lead.notes}` : null;

        if (existingId) {
          const { data: current, error: currentError } = await supabaseAdmin
            .from("leads")
            .select("notes")
            .eq("id", existingId)
            .eq("company_id", companyId)
            .single();
          if (currentError) return json({ error: "Could not load the matched lead." }, 500);

          const { error } = await supabaseAdmin
            .from("leads")
            .update({
              last_touch_at: stamp,
              deleted_at: null,
              ...(noteLine
                ? { notes: [current?.notes, noteLine].filter(Boolean).join("\n\n") }
                : {}),
              ...(lead.contactName ? { contact_name: lead.contactName } : {}),
              ...(lead.phone ? { phone: lead.phone } : {}),
              ...(lead.email ? { email: lead.email } : {}),
            })
            .eq("id", existingId)
            .eq("company_id", companyId);
          if (error) return json({ error: error.message }, 500);

          const { error: activityError } = await supabaseAdmin.from("activities").insert({
            lead_id: existingId,
            company_id: companyId,
            channel: "note",
            direction: "inbound",
            body: lead.notes ?? `Nieuwe B2B-aanvraag via website.`,
          });
          if (activityError) return json({ error: activityError.message }, 500);

          await recordAnalytics(existingId);
          return json({ status: "matched", leadId: existingId });
        }

        const { data: created, error } = await supabaseAdmin
          .from("leads")
          .insert({
            company: lead.company,
            company_id: companyId,
            source: "website",
            stage: "new",

            priority: 3,
            campaign: lead.campaign ?? defaultCampaign,
            last_touch_at: stamp,
            ...(lead.contactName ? { contact_name: lead.contactName } : {}),
            ...(lead.email ? { email: lead.email } : {}),
            ...(lead.phone ? { phone: lead.phone } : {}),
            ...(lead.jobTitle ? { job_title: lead.jobTitle } : {}),
            ...(lead.city ? { city: lead.city } : {}),
            ...(lead.country ? { country: lead.country } : {}),
            ...(lead.website ? { website: lead.website } : {}),
            ...(lead.linkedinUrl ? { linkedin_url: lead.linkedinUrl } : {}),
            ...(noteLine ? { notes: noteLine } : {}),
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);

        const { error: activityError } = await supabaseAdmin.from("activities").insert({
          lead_id: created.id,
          company_id: companyId,
          channel: "note",
          direction: "inbound",
          body: lead.notes ?? `Nieuwe B2B-aanvraag via website.`,
        });
        if (activityError) return json({ error: activityError.message }, 500);

        await recordAnalytics(created.id);
        return json({ status: "created", leadId: created.id }, 201);
      },
    },
  },
});
