import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ConnectAI({ heading = "h1" }: { heading?: "h1" | "h2" }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const Heading = heading;
  const local = !origin || !origin.startsWith("https://") || /localhost|127\.0\.0\.1/.test(origin);
  const url = origin ? `${origin}/mcp` : "";
  return (
    <div className="space-y-5">
      <div>
        <Heading className="text-2xl font-semibold">ChatGPT koppelen</Heading>
        <p className="mt-2 text-sm text-muted-foreground">
          Voeg leads toe vanuit je gesprek en bewaar e-mailconcepten of verstuurde berichten bij het
          juiste contact.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Verbinding instellen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant="outline">
            {local
              ? "Lokaal voorbereid · nog niet verbonden"
              : "Beschikbaar voor configuratie · verbinding nog te testen"}
          </Badge>
          <p className="text-sm">
            {local
              ? "De CRM draait nu lokaal. Voor ChatGPT is een bereikbaar HTTPS-adres nodig. Publiceer de CRM voordat je de verbinding activeert."
              : "Voeg dit adres toe in ChatGPT en meld je aan met je CRM-account. Test daarna of een lead kan worden toegevoegd."}
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <code className="text-sm break-all">{url}</code>
            <Button
              variant="outline"
              disabled={!url}
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast.success("Adres gekopieerd");
              }}
            >
              Kopieer adres
            </Button>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Schakel in ChatGPT de ontwikkelaarsmodus in via Instellingen → Security and login, als
              je account dit toestaat.
            </li>
            <li>
              Voeg in Plugins een verbinding toe met de naam Sales CRM en het publieke HTTPS-adres
              hierboven.
            </li>
            <li>
              Kies OAuth en meld je aan met je CRM-account. De OAuth-instellingen van de database
              moeten hiervoor geconfigureerd zijn.
            </li>
            <li>
              Selecteer Sales CRM in je gesprek en vraag: “Voeg deze contactpersoon toe aan mijn CRM
              en bewaar deze e-mail als concept.”
            </li>
          </ol>
          <a
            className="text-sm text-primary underline"
            href="https://developers.openai.com/plugins/build/app-quickstart"
            target="_blank"
            rel="noreferrer"
          >
            Officiële OpenAI-instructies
          </a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Leads uit e-mails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Je kunt een contact, bedrijf, e-mailadres, onderwerp en bericht vanuit ons gesprek laten
            opslaan. Bestaande leads worden gezocht voordat een nieuwe lead wordt aangemaakt.
          </p>
          <p>
            Concepten blijven concepten. Alleen wanneer een bericht werkelijk verzonden is, wordt
            het als verstuurde e-mail geregistreerd.
          </p>
          <p>
            Deze verbinding verstuurt zelf geen e-mails en leest niet automatisch je mailbox.
            Gebruik daarvoor een afzonderlijke e-mailverbinding, of geef de contactgegevens en het
            bericht in het gesprek.
          </p>
          <p>
            Nieuwe leads verschijnen automatisch op het dashboard, dat elke 30 seconden ververst.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
