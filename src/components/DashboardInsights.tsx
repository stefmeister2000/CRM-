import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import type { Lead } from "@/hooks/use-pipeline-leads";
import { STAGES, SOURCES, formatMoney } from "@/lib/sales";

const names = [
  "Nieuw",
  "Gecontacteerd",
  "Interesse",
  "Afspraak",
  "Voorstel",
  "Gewonnen",
  "Verloren",
];
const colors = ["#5276b4", "#7986cb", "#aa78bc", "#d29a47", "#de805e", "#40977f", "#8993a3"];
const sourceNames: Record<string, string> = {
  email: "E-mail",
  linkedin: "LinkedIn",
  ads: "Advertenties",
  referral: "Doorverwijzing",
  website: "Website",
  csv: "CSV-import",
  event: "Evenement",
  cold_call: "Telefonische prospectie",
};

export function DashboardInsights({ leads, nl }: { leads: Lead[]; nl: boolean }) {
  const open = leads.filter((lead) => !["won", "lost"].includes(lead.stage));
  const now = Date.now();
  const actions = open
    .map((lead) => {
      const days = Math.max(
        0,
        Math.floor((now - new Date(lead.last_touch_at ?? lead.created_at).getTime()) / 86400000),
      );
      const overdue = days >= 7;
      const reason = overdue
        ? nl
          ? `${days} dagen zonder contact`
          : `${days} days without contact`
        : lead.stage === "new"
          ? nl
            ? "Plan het eerste contact"
            : "Make first contact"
          : lead.value_estimate == null
            ? nl
              ? "Voeg een waardeschatting toe"
              : "Add an estimated value"
            : lead.stage === "proposal"
              ? nl
                ? "Volg het voorstel op"
                : "Follow up on the proposal"
              : null;
      return {
        lead,
        reason,
        overdue,
        rank: overdue
          ? 1000 + days
          : lead.stage === "new"
            ? 300
            : lead.value_estimate == null
              ? 200
              : 100,
      };
    })
    .filter((item) => item.reason)
    .sort((a, b) => b.rank - a.rank || a.lead.created_at.localeCompare(b.lead.created_at));
  const stages = STAGES.map((stage, i) => ({
    ...stage,
    label: nl ? names[i] : stage.label,
    color: colors[i],
    count: leads.filter((l) => l.stage === stage.value).length,
  }));
  const sources = Object.entries(
    leads.reduce<Record<string, number>>((counts, lead) => {
      const key = lead.source || "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const recent = [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);
  const stageLabel = (stage: string) => stages.find((s) => s.value === stage)?.label ?? stage;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
              PIPELINE
            </p>
            <h2 className="text-xl">
              {nl ? "Waar staan je prospects?" : "Where are your prospects?"}
            </h2>
          </div>
          <Link
            to="/prospectflow"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {nl ? "Open flow" : "Open flow"}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {nl
            ? `${open.length} actieve kansen · verdeling van alle ${leads.length} prospects`
            : `${open.length} active opportunities · distribution of all ${leads.length} prospects`}
        </p>
        <div className="my-6 flex h-3 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          {stages
            .filter((s) => s.count)
            .map((s) => (
              <div
                key={s.value}
                style={{ width: `${(s.count / leads.length) * 100}%`, backgroundColor: s.color }}
              />
            ))}
        </div>
        <div className="space-y-3">
          {stages.map((s) => (
            <div key={s.value} className="flex items-center gap-3 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1">{s.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {leads.length ? Math.round((s.count / leads.length) * 100) : 0}%
              </span>
              <span className="w-7 text-right font-semibold tabular-nums">{s.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
              {nl ? "VOLGENDE STAP" : "NEXT STEP"}
            </p>
            <h2 className="text-xl">{nl ? "Pak deze kansen op" : "Keep things moving"}</h2>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {actions.length}{" "}
            {nl
              ? actions.length === 1
                ? "actie"
                : "acties"
              : actions.length === 1
                ? "action"
                : "actions"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {nl
            ? "Suggesties op basis van contact, stadium en waarde."
            : "Suggestions based on contact, stage and value."}
        </p>
        <div className="mt-5 space-y-2">
          {actions.slice(0, 4).map(({ lead, reason, overdue }) => (
            <Link
              key={lead.id}
              to="/leads"
              search={{ lead: lead.id }}
              className="group flex items-center gap-3 rounded-xl border border-transparent bg-secondary/50 p-3 transition hover:border-primary/20 hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                className={`rounded-lg p-2 ${overdue ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}
              >
                {overdue ? <Clock3 className="size-4" /> : <Sparkles className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{lead.company}</span>
                <span className="block text-xs text-muted-foreground">{reason}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </div>
        {!actions.length && (
          <div className="mt-8 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-800">
            <CheckCircle2 className="mb-3 size-6" />
            {nl
              ? "Alles bijgewerkt. Er zijn momenteel geen voorgestelde opvolgacties."
              : "All caught up. No suggested follow-ups right now."}
          </div>
        )}
        {actions.length > 4 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {nl
              ? `De 4 belangrijkste van ${actions.length} acties.`
              : `Showing the top 4 of ${actions.length} actions.`}
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl">{nl ? "Recent binnengekomen" : "Recently added"}</h2>
          <Link
            to="/leads"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {nl ? "Alle leads" : "All leads"}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
        <div className="divide-y">
          {recent.map((lead) => (
            <Link
              to="/leads"
              search={{ lead: lead.id }}
              key={lead.id}
              className="flex items-center gap-3 rounded-lg py-4 transition hover:bg-secondary/50"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {lead.company
                  .replace(/^TEST\s*[—–-]\s*/, "")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{lead.company}</span>
                <span className="block text-xs text-muted-foreground">
                  {stageLabel(lead.stage)} ·{" "}
                  {new Date(lead.created_at).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {lead.value_estimate == null
                  ? nl
                    ? "Nog te bepalen"
                    : "Not valued"
                  : formatMoney(lead.value_estimate)}
              </span>
            </Link>
          ))}
        </div>
        {!recent.length && (
          <p className="py-6 text-sm text-muted-foreground">
            {nl
              ? "Je nieuwe prospects verschijnen hier zodra je ze toevoegt."
              : "Your new prospects will appear here as you add them."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl">
          {nl ? "Waar komen leads vandaan?" : "Where do leads come from?"}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {nl
            ? "Je kanalen, op basis van alle geregistreerde leads."
            : "Your channels, based on all recorded leads."}
        </p>
        <div className="mt-6 space-y-4">
          {sources.map(([source, count]) => (
            <div key={source}>
              <div className="mb-2 flex justify-between text-sm">
                <span>
                  {nl
                    ? (sourceNames[source] ?? (source === "unknown" ? "Onbekend" : source))
                    : (SOURCES.find((s) => s.value === source)?.label ??
                      (source === "unknown" ? "Unknown" : source.replaceAll("_", " ")))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count} · {Math.round((count / leads.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(count / leads.length) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {!sources.length && (
          <p className="py-6 text-sm text-muted-foreground">
            {nl
              ? "Voeg leads met een bron toe om je kanalen te vergelijken."
              : "Add leads with a source to compare your channels."}
          </p>
        )}
      </section>
    </div>
  );
}
