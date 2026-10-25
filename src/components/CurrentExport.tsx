import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CURRENT_EXPORT_PATH } from "@/lib/current-export";
import {
  getCurrentExportToken,
  rotateCurrentExportToken,
} from "@/lib/current-export-token.functions";
import { useCurrentUser } from "@/hooks/use-current-user";

type TokenInfo = Awaited<ReturnType<typeof getCurrentExportToken>>;

export function CurrentExport() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.roles.includes("admin") ?? false;

  const fetchToken = useServerFn(getCurrentExportToken);
  const rotate = useServerFn(rotateCurrentExportToken);

  const {
    data: tokenInfo,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["current-export-token"],
    enabled: isAdmin,
    queryFn: () => fetchToken({ data: undefined }),
  });

  const rotateToken = useMutation({
    mutationFn: () => rotate({ data: undefined }),
    onSuccess: (result) => {
      queryClient.setQueryData<TokenInfo>(["current-export-token"], (previous) =>
        previous ? { ...previous, token: result.token, updatedAt: result.updatedAt } : previous,
      );
      toast.success("Nieuw rapporteringstoken aangemaakt");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) return null;

  const url = origin ? `${origin}${CURRENT_EXPORT_PATH}` : "";
  const token = tokenInfo?.token ?? null;
  const workspaceId = tokenInfo?.workspaceId ?? null;

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} gekopieerd`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Current (marketing dashboard)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Current leest de leads van deze workspace en hun fase in de pipeline uit voor
          rapportering. Er worden geen contactgegevens gedeeld: geen namen, e-mailadressen,
          telefoonnummers, notities of bedrijfsnamen, alleen aanmaakdatum, fase, waarde, bron,
          campagne en soort lead.
        </p>

        {isPending && <p role="status">Configuratie laden…</p>}
        {isError && (
          <p role="alert">
            De verbindingsinstellingen konden niet worden geladen. Probeer opnieuw zodra de server
            is geconfigureerd.
          </p>
        )}
        {tokenInfo?.serverConfigured === false && (
          <p role="status">
            De serververbinding met de database moet nog worden ingesteld. Daarna kan een beheerder
            het rapporteringstoken aanmaken.
          </p>
        )}

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Adres</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-secondary/60 px-2 py-1 text-xs break-all">{url}</code>
            <Button size="sm" variant="outline" onClick={() => copy(url, "Adres")}>
              Kopieer adres
            </Button>
          </div>
        </div>

        {workspaceId && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace ID</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-secondary/60 px-2 py-1 text-xs break-all">
                {workspaceId}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(workspaceId, "Workspace ID")}>
                Kopieer Workspace ID
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Rapporteringstoken
          </p>
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
              Er is nog geen rapporteringstoken. Maak er één aan en plak het samen met de Workspace
              ID in Current.
            </p>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => rotateToken.mutate()}
          disabled={rotateToken.isPending || !tokenInfo?.serverConfigured || isError}
        >
          {rotateToken.isPending ? "Bezig…" : token ? "Nieuw token aanmaken" : "Token aanmaken"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Current gebruikt het token in de header
          <code className="mx-1 rounded bg-secondary/60 px-1">Authorization: Bearer</code>. Zodra je
          een nieuw token aanmaakt, werkt het oude niet meer; plak de nieuwe waarde daarna ook in
          Current. Bewaar het token alleen in Current, nooit in browsercode of e-mail.
        </p>
      </CardContent>
    </Card>
  );
}
