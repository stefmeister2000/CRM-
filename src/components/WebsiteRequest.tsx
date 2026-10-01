import { useLanguage } from "@/hooks/use-language";

const labels: Record<string, [string, string]> = {
  Doel: ["Wat wil de prospect?", "What are they looking for?"],
  Uitdaging: ["Uitdaging", "Challenge"],
  "Maandelijkse investering": ["Budget per maand", "Monthly budget"],
  "Huidige kanalen": ["Huidige kanalen", "Current channels"],
  Timing: ["Gewenste timing", "Preferred timing"],
  "Extra informatie": ["Extra informatie", "Additional information"],
};

export function WebsiteRequest({
  notes,
  source,
  requests,
}: {
  notes: string | null;
  source: string;
  requests: { body: string | null; occurred_at: string }[];
}) {
  const { language } = useLanguage();
  const nl = language === "nl";
  // Activities preserve submitted requests even when the general notes are edited.
  const latest = requests.find((request) => request.body?.trim());
  const raw = latest?.body ?? notes ?? "";
  const entries: { label: string; value: string }[] = [];
  let current: { label: string; value: string } | undefined;
  const cleaned =
    raw
      .split(/Aanvraag website \([^)]*\):\s*/)
      .filter(Boolean)
      .at(-1) ?? "";
  for (const line of cleaned.split("\n")) {
    const match = line.match(
      /^(Doel|Uitdaging|Maandelijkse investering|Huidige kanalen|Timing|Extra informatie|Formulier|Taal|utm_\w+|landing_path|referrer):\s*(.*)$/,
    );
    if (match) {
      current = { label: match[1]!, value: match[2]! };
      entries.push(current);
    } else if (current) current.value += `\n${line}`;
  }
  const answers = entries.filter((entry) => labels[entry.label] && entry.value.trim());
  if (source !== "website" && !latest) return null;
  return (
    <section
      className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-5"
      aria-label={nl ? "Websiteaanvraag" : "Website enquiry"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{nl ? "Websiteaanvraag" : "Website enquiry"}</h3>
        {latest && (
          <span className="text-xs text-muted-foreground">
            {new Date(latest.occurred_at).toLocaleDateString(nl ? "nl-BE" : "en-GB")}
          </span>
        )}
      </div>
      {answers.length ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          {answers.map((answer, i) => (
            <div
              key={i}
              className={
                ["Doel", "Uitdaging", "Extra informatie"].includes(answer.label)
                  ? "sm:col-span-2"
                  : ""
              }
            >
              <dt className="mb-1 text-xs font-medium text-muted-foreground">
                {labels[answer.label]![nl ? 0 : 1]}
              </dt>
              <dd
                className={`whitespace-pre-wrap break-words ${answer.label === "Doel" ? "text-lg font-semibold" : "text-sm"}`}
              >
                {answer.value.trim()}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">
          {raw.trim() ||
            (nl
              ? "Bij deze aanvraag is geen toelichting opgeslagen."
              : "No request details were saved for this enquiry.")}
        </p>
      )}
      {requests.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {nl
            ? "Meest recente aanvraag. Eerdere aanvragen staan in de geschiedenis."
            : "Latest enquiry. Previous requests are available in history."}
        </p>
      )}
    </section>
  );
}
