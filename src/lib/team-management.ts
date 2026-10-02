import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

export function invitationUrl(publicUrl: string | undefined, token?: string) {
  if (!publicUrl) throw new Error("Stel CRM_PUBLIC_URL in op het publieke adres van de CRM.");
  const url = new URL(publicUrl);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
    url.username ||
    url.password
  ) {
    throw new Error("CRM_PUBLIC_URL moet een veilig HTTPS-adres zijn.");
  }
  const invite = new URL("/accept-invite", url.origin);
  if (token) invite.hash = new URLSearchParams({ token_hash: token }).toString();
  return invite.toString();
}

export async function assertTeamAdmin(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Alleen beheerders kunnen gebruikers beheren.");
}

export async function inviteMember(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  actorId: string,
  input: {
    email: string;
    fullName: string;
    role: "admin" | "team_leader" | "rep";
    team?: string | undefined;
  },
  publicUrl: string | undefined,
) {
  await assertTeamAdmin(client, actorId);
  const redirectTo = invitationUrl(publicUrl);
  // Generates a one-use invitation; no email is sent and no shared password is created.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo, data: { full_name: input.fullName } },
  });
  if (error) {
    if (
      error.code === "email_exists" ||
      error.code === "user_already_exists" ||
      /already.*registered|already.*exists/i.test(error.message)
    ) {
      throw new Error(
        "Dit e-mailadres heeft al een account. Laat deze persoon aanmelden met het bestaande wachtwoord. Een uitnodiging overschrijft geen bestaand account.",
      );
    }
    if (error.status === 429)
      throw new Error("Er zijn te veel aanvragen tegelijk. Wacht even en probeer opnieuw.");
    throw new Error(error.message);
  }
  if (!data.user?.id || !data.properties?.hashed_token)
    throw new Error("Uitnodiging kon niet worden aangemaakt.");
  const { error: setupError } = await client.rpc("configure_crm_invitation", {
    _user_id: data.user.id,
    _full_name: input.fullName,
    _team: input.team || "",
    _role: input.role,
  });
  // A failure leaves an unapproved Auth account; do not delete a potentially existing account.
  // Never return a login token until the complete profile and role transaction succeeds.
  if (setupError) throw new Error(setupError.message);
  return {
    id: data.user.id,
    email: input.email,
    url: invitationUrl(publicUrl, data.properties.hashed_token),
  };
}

export async function removeMember(
  client: SupabaseClient<Database>,
  actorId: string,
  userId: string,
) {
  await assertTeamAdmin(client, actorId);
  if (actorId === userId) throw new Error("Je kunt jezelf niet verwijderen.");
  const { error } = await client.rpc("remove_crm_member", { _user_id: userId });
  if (error) throw new Error(error.message);
  return { ok: true };
}
