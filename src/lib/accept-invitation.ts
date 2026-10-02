import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

export interface InvitationProgress {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export async function finishInvitation(
  client: SupabaseClient<Database>,
  token: string,
  password: string,
  confirmation: string,
  progress: InvitationProgress,
) {
  if (!token) throw new Error("Open de volledige uitnodigingslink van je beheerder.");
  if (password.length < 8 || password !== confirmation) {
    throw new Error("Gebruik minstens 8 tekens en vul tweemaal hetzelfde wachtwoord in.");
  }
  // Remember only which authenticated user verified this link, never the invite token.
  // This allows retrying after a network/password-policy error or a page reload.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const key = `crm-invite:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  let userId = progress.getItem(key);
  if (!userId) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: "invite" });
    if (error || !data.user || !data.session) {
      if (
        error &&
        (error.status === 0 ||
          (error.status ?? 0) >= 500 ||
          error.name === "AuthRetryableFetchError")
      ) {
        throw new Error(
          "De verbinding is tijdelijk niet beschikbaar. Probeer dezelfde link opnieuw.",
        );
      }
      throw new Error(
        "Deze uitnodiging is verlopen, ongeldig of al gebruikt. Vraag je beheerder om een nieuwe link. Heb je al een wachtwoord ingesteld? Meld je dan aan.",
      );
    }
    userId = data.user.id;
    progress.setItem(key, userId);
  }
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || auth.user?.id !== userId) {
    throw new Error(
      "Je aanmeldsessie is gewijzigd of verlopen. Meld je aan met je eigen account of vraag je beheerder om hulp.",
    );
  }
  const { data: roles, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleError) throw new Error("Je toegang kon niet worden gecontroleerd. Probeer opnieuw.");
  if (!roles?.length)
    throw new Error(
      "Deze uitnodiging geeft geen CRM-toegang meer. Neem contact op met je beheerder.",
    );
  const { error: passwordError } = await client.auth.updateUser({ password });
  if (passwordError) throw new Error(passwordError.message);
  progress.removeItem(key);
  return userId;
}
