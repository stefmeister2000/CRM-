import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { inviteMember } from "./team-management.ts";

type Mail = { id: string; email: string; fullName: string; companyName: string; url: string };
export type InvitationDelivery = { status: "sent"; messageId: string } | { status: "unconfirmed" };

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function invitationMessage(mail: Mail) {
  const subject = `Uitnodiging voor ${mail.companyName.replace(/[\r\n]+/g, " ")} · Sales CRM`;
  const introduction = `Je bent uitgenodigd om deel te nemen aan ${mail.companyName} in Sales CRM.`;
  const instructions =
    "Je krijgt alleen toegang tot dit bedrijf. Heb je al een account? Meld je aan met het e-mailadres waarop je deze uitnodiging ontvangt. Nieuwe gebruikers kiezen hun eigen wachtwoord.";
  const expiry =
    "Accepteer je uitnodiging zo snel mogelijk. De bedrijfsuitnodiging is 7 dagen geldig; de activatielink voor een nieuw account kan eerder verlopen. Vraag dan de beheerder om een nieuwe uitnodiging.";
  const safety =
    "Verwacht je deze uitnodiging niet? Dan mag je deze e-mail negeren. Deel je persoonlijke link niet met anderen.";
  return {
    subject,
    text: `Hallo ${mail.fullName},\n\n${introduction}\n\nUitnodiging accepteren:\n${mail.url}\n\n${instructions}\n\n${expiry}\n\n${safety}`,
    html: `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#17202e">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px">
<table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border:1px solid #e2e5e9;border-radius:16px;background:#ffffff;border-spacing:0"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:13px;font-weight:bold;letter-spacing:1px;color:#596579">SALES CRM</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.3">Je bent uitgenodigd voor ${escapeHtml(mail.companyName)}</h1>
<p style="font-size:16px;line-height:1.6">Hallo ${escapeHtml(mail.fullName)},</p>
<p style="font-size:16px;line-height:1.6">${escapeHtml(introduction)}</p>
<p style="margin:28px 0"><a href="${escapeHtml(mail.url)}" style="display:inline-block;box-sizing:border-box;background:#1d4ed8;color:#ffffff;padding:15px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Uitnodiging accepteren</a></p>
<p style="font-size:14px;line-height:1.6">${escapeHtml(instructions)}</p>
<p style="font-size:13px;line-height:1.6;color:#596579">${escapeHtml(expiry)}</p>
<p style="font-size:13px;line-height:1.6;color:#596579">${escapeHtml(safety)}</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}

export function createInvitationSender({
  apiKey,
  from,
  fetchImpl = fetch,
  sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: {
  apiKey: string | undefined;
  from: string | undefined;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<unknown>;
}) {
  if (!apiKey || !from || /[\r\n]/.test(from))
    throw new Error(
      "Uitnodigingsmails zijn nog niet ingesteld. Configureer RESEND_API_KEY en CRM_INVITATION_FROM op de server.",
    );

  return async (mail: Mail): Promise<InvitationDelivery> => {
    const message = invitationMessage(mail);
    const body = JSON.stringify({ from, to: [mail.email], ...message });
    for (let attempt = 0; attempt < 3; attempt++) {
      let retry = true;
      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `company-invitation/${mail.id}`,
          },
          body,
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.id === "string" && result.id)
            return { status: "sent", messageId: result.id };
        } else {
          retry = response.status === 429 || response.status === 409 || response.status >= 500;
        }
      } catch {
        // A timeout may happen after acceptance. Retry the identical message with the same key.
      }
      if (!retry || attempt === 2) break;
      await sleep(1000 * 2 ** attempt);
    }
    // Do not expose provider responses or log personal links. The UI retains the link as a fallback.
    return { status: "unconfirmed" };
  };
}

export async function inviteMemberByEmail(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  actorId: string,
  input: Parameters<typeof inviteMember>[3],
  publicUrl: string | undefined,
  companyId: string,
  send: (mail: Mail) => Promise<InvitationDelivery>,
) {
  // companyId comes from authenticated middleware; the name is read under the caller's RLS.
  const { data: company, error } = await client
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();
  if (error || !company?.name)
    throw new Error("Het geselecteerde bedrijf kon niet worden geladen.");
  const invitation = await inviteMember(client, admin, actorId, input, publicUrl);
  const delivery = await send({
    ...invitation,
    fullName: input.fullName,
    companyName: company.name,
  });
  return { ...invitation, companyName: company.name, delivery };
}
