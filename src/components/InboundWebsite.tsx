import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInboundToken, rotateInboundToken } from "@/lib/inbound-token.functions";
import { useCurrentUser } from "@/hooks/use-current-user";

export function InboundWebsite() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.roles.includes("admin") ?? false;

  const fetchToken = useServerFn(getInboundToken);
  const rotate = useServerFn(rotateInboundToken);

  const {
    data: tokenInfo,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["inbound-token"],
    enabled: isAdmin,
    queryFn: () => fetchToken({ data: undefined }),
  });

  const rotateToken = useMutation({
    mutationFn: () => rotate({ data: undefined }),
    onSuccess: (result) => {
      queryClient.setQueryData(["inbound-token"], {
        token: result.token,
        updatedAt: new Date().toISOString(),
        source: "app",
        serverConfigured: true,
      });
      toast.success("Nieuw token aangemaakt");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const url = origin ? `${origin}/api/public/inbound-lead` : "";
  const token = tokenInfo?.token ?? null;

  const header = `POST ${url}
Content-Type: application/json
x-inbound-token: ${token ?? "<jullie token>"}`;

  const example = `${header}

{
  "company": "Example Company",
  "contactName": "Alex Morgan",
  "email": "alex@example.com",
  "campaign": "stefkeppens.com",
  "notes": "Interested in a product demo"
}`;

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} gekopieerd`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl">Websiteleads · stefkeppens.com</h2>
        <p className="my-2 text-sm font-medium">
          Voorbereid voor later · website nog niet aangesloten
        </p>
        <p className="text-sm text-muted-foreground">
          Websiteaanvragen komen hier binnen als nieuwe leads. Bestaat het bedrijf of e-mailadres
          al, dan wordt de aanvraag aan het bestaande account toegevoegd.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ontvangstadres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-secondary/60 px-2 py-1 text-xs break-all">{url}</code>
            <Button size="sm" variant="outline" onClick={() => copy(url, "Adres")}>
              Kopieer adres
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Verstuur het formulier vanuit de server van stefkeppens.com naar het publieke
            HTTPS-adres van deze CRM. Het token hoort in de header
            <code className="mx-1 rounded bg-secondary/60 px-1">x-inbound-token</code>; aanvragen
            zonder geldig token worden geweigerd.
          </p>
          <p className="text-sm text-muted-foreground">
            Bewaar het token uitsluitend op de websiteserver, nooit in browsercode of het openbare
            formulier. Een localhost-adres werkt niet vanaf de website.
          </p>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPending && <p role="status">Configuratie laden…</p>}
            {isError && (
              <p role="alert">
                De verbindingsinstellingen konden niet worden geladen. Probeer opnieuw zodra de
                server is geconfigureerd.
              </p>
            )}
            {tokenInfo?.serverConfigured === false && (
              <p role="status">
                De serververbinding met de database moet nog worden ingesteld. Daarna kan een
                beheerder het websitetoken aanmaken.
              </p>
            )}
            {token ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-secondary/60 px-2 py-1 text-xs break-all">
                    {token}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copy(token, "Token")}>
                    Kopieer token
                  </Button>
                </div>
                {tokenInfo?.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Laatst vernieuwd op {new Date(tokenInfo.updatedAt).toLocaleString("nl-BE")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Er is hier nog geen token ingesteld. Maak er één aan en zet dezelfde waarde in het
                andere project.
              </p>
            )}
            <Button
              size="sm"
              onClick={() => rotateToken.mutate()}
              disabled={rotateToken.isPending || !tokenInfo?.serverConfigured || isError}
            >
              {rotateToken.isPending ? "Bezig…" : token ? "Nieuw token aanmaken" : "Token aanmaken"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Zodra je een nieuw token aanmaakt, werkt het oude niet meer. Zet de nieuwe waarde
              daarna ook in het andere project.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Voorbeeld: websiteaanvraag</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md bg-secondary/60 p-3 text-xs">{example}</pre>
          <Button size="sm" variant="outline" onClick={() => copy(example, "Voorbeeld")}>
            Kopieer voorbeeld
          </Button>
          <p className="text-xs text-muted-foreground">
            Alleen <strong>company</strong> is verplicht. Alle aanvragen komen in dezelfde
            salesworkspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
