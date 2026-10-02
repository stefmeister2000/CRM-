import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isDatabaseConfigured } from "@/integrations/supabase/client";
import { finishInvitation, type InvitationProgress } from "@/lib/accept-invitation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Uitnodiging accepteren | Sales CRM" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string>();
  const [ready, setReady] = useState(false);
  const memory = useRef(new Map<string, string>());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token_hash") ?? "");
    setReady(true);
    if (isDatabaseConfigured) {
      void supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email));
    }
  }, []);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8 || password !== confirm) {
      setError("Gebruik minstens 8 tekens en vul tweemaal hetzelfde wachtwoord in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const progress: InvitationProgress = {
        getItem: (key) => {
          try {
            return sessionStorage.getItem(key) ?? memory.current.get(key) ?? null;
          } catch {
            return memory.current.get(key) ?? null;
          }
        },
        setItem: (key, value) => {
          memory.current.set(key, value);
          try {
            sessionStorage.setItem(key, value);
          } catch {
            /* In-memory retry still works when storage is blocked. */
          }
        },
        removeItem: (key) => {
          memory.current.delete(key);
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* Storage may be blocked. */
          }
        },
      };
      await finishInvitation(supabase, token, password, confirm, progress);
      window.history.replaceState(null, "", window.location.pathname);
      setPassword("");
      setConfirm("");
      queryClient.clear();
      await navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Uitnodiging accepteren is niet gelukt. Probeer opnieuw.",
      );
    } finally {
      // Verification may switch identities even when the password step needs a retry.
      queryClient.clear();
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl">Welkom bij Sales CRM</h1>
        <p className="text-sm text-muted-foreground">
          Kies je eigen wachtwoord om je uitnodiging te accepteren en de CRM te openen.
        </p>
        {!ready ? (
          <p role="status">Uitnodiging laden…</p>
        ) : !isDatabaseConfigured ? (
          <p role="alert">De CRM is nog niet geconfigureerd. Neem contact op met je beheerder.</p>
        ) : !token ? (
          <p role="alert">
            De uitnodigingslink is onvolledig. Open de volledige link die je beheerder heeft
            doorgestuurd.
          </p>
        ) : (
          <form onSubmit={accept} className="space-y-4">
            {currentEmail && (
              <p className="text-sm text-muted-foreground">
                Je bent aangemeld als {currentEmail}. Bij accepteren schakel je over naar het
                uitgenodigde account.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="invite-password">Nieuw wachtwoord</Label>
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-confirm">Herhaal wachtwoord</Label>
              <Input
                id="invite-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Bezig…" : "Uitnodiging accepteren"}
            </Button>
          </form>
        )}
        <Link to="/auth" className="block text-sm text-primary underline">
          Al een account? Aanmelden
        </Link>
      </div>
    </main>
  );
}
