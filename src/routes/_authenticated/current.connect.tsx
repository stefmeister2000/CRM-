import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { approveCurrentConnect } from "@/lib/current-connect.functions";
import { currentCallbackUrl, validConnectState } from "@/lib/current-connect";

// Opened from Current → Settings → CRM → "Connect with your CRM". The admin approves for the selected company.
export const Route = createFileRoute("/_authenticated/current/connect")({
  head: () => ({
    meta: [
      { title: "Current koppelen | Sales CRM" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { state?: string; business?: string } => ({
    ...(typeof search["state"] === "string" ? { state: search["state"] } : {}),
    ...(typeof search["business"] === "string"
      ? { business: search["business"].slice(0, 80) }
      : {}),
  }),
  component: CurrentConnect,
});

function CurrentConnect() {
  const { state, business } = Route.useSearch();
  const { company } = Route.useRouteContext();
  const { data: me, isPending } = useCurrentUser();
  const approve = useServerFn(approveCurrentConnect);
  const connect = useMutation({
    mutationFn: () => approve({ data: { state } }),
    onSuccess: (result) => window.location.assign(result.redirect),
  });
  const valid = validConnectState(state);
  const isAdmin = me?.roles.includes("admin") ?? false;

  return (
    <div className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current koppelen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!valid ? (
            <p role="alert" className="text-sm">
              Deze link is verlopen of ongeldig. Start opnieuw vanuit Current → Settings → CRM →
              Connect with your CRM.
            </p>
          ) : isPending ? (
            <p role="status">Laden…</p>
          ) : !isAdmin ? (
            <p role="alert" className="text-sm">
              Alleen beheerders kunnen Current koppelen. Vraag een beheerder om deze stap te doen.
            </p>
          ) : (
            <>
              <p className="text-sm">
                Current{business ? ` (business “${business}”)` : ""} vraagt leestoegang tot de leads
                van <strong>{company.name}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Current leest alleen aanmaakdatum, fase, waarde, bron, campagne en soort lead. Geen
                namen, e-mailadressen, telefoonnummers, notities of bedrijfsnamen. Een bestaand
                rapporteringstoken blijft werken.
              </p>
              <p className="text-sm text-muted-foreground">
                Verkeerde workspace? Kies eerst de juiste workspace bovenaan en open deze link
                opnieuw.
              </p>
              {connect.error && (
                <p role="alert" className="text-sm text-destructive">
                  {connect.error.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending || connect.isSuccess}
                >
                  {connect.isPending || connect.isSuccess ? "Koppelen…" : `Koppel ${company.name}`}
                </Button>
                <Button
                  variant="outline"
                  disabled={connect.isPending || connect.isSuccess}
                  onClick={() =>
                    window.location.assign(currentCallbackUrl(state, { error: "denied" }))
                  }
                >
                  Annuleren
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
