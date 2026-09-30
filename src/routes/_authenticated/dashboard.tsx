import { createFileRoute, Link } from "@tanstack/react-router";
import { startOfWeek, addWeeks, format } from "date-fns";
import { ArrowUpRight, Users, TrendingUp, Target, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardInsights } from "@/components/DashboardInsights";
import { useLanguage } from "@/hooks/use-language";
import { usePipelineLeads } from "@/hooks/use-pipeline-leads";
import { formatMoney } from "@/lib/sales";
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Sales CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { language } = useLanguage();
  const nl = language === "nl";
  const { data: leads = [], isPending, isError, refetch, isFetching } = usePipelineLeads();
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addWeeks(monday, i - 7);
    const end = addWeeks(start, 1);
    return {
      start,
      count: leads.filter(
        (l) =>
          new Date(l.created_at) >= start &&
          new Date(l.created_at) < end &&
          new Date(l.created_at) <= now,
      ).length,
    };
  });
  const current = weeks[7]?.count ?? 0;
  const previous = weeks[6]?.count ?? 0;
  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const won = leads.filter((l) => l.stage === "won");
  const closed = leads.filter((l) => l.stage === "won" || l.stage === "lost");
  const stale = open.filter(
    (l) => now.getTime() - new Date(l.last_touch_at ?? l.created_at).getTime() >= 7 * 86400000,
  ).length;
  const stats = [
    {
      title: nl ? "Nieuw deze week" : "New this week",
      value: current,
      note: `${previous} ${nl ? "vorige volledige week" : "last full week"}`,
      icon: Users,
    },
    {
      title: nl ? "Open pipeline (geschat)" : "Open pipeline (estimated)",
      value: formatMoney(open.reduce((n, l) => n + (l.value_estimate ?? 0), 0)),
      note: nl
        ? `${open.length} actieve prospects · ${open.filter((l) => l.value_estimate == null).length} nog zonder waardeschatting`
        : `${open.length} active prospects · ${open.filter((l) => l.value_estimate == null).length} not yet valued`,
      icon: Wallet,
    },
    {
      title: nl ? "Winpercentage" : "Win rate",
      value: closed.length ? `${Math.round((won.length / closed.length) * 100)}%` : "—",
      note: nl
        ? `${won.length} gewonnen / ${closed.length} afgesloten`
        : `${won.length} won / ${closed.length} closed`,
      icon: Target,
    },
    {
      title: nl ? "Opvolging nodig" : "Needs follow-up",
      value: stale,
      note: nl ? "7+ dagen zonder contact · open leads" : "7+ days without contact · open leads",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.22em] text-primary">SALES OVERVIEW</p>
          <h1 className="break-words text-3xl sm:text-4xl">
            {nl ? "Van eerste contact tot deal." : "From first hello to closed deal."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {nl
              ? "Je instroom, kansen en volgende stappen op één plek."
              : "Your incoming leads, opportunities and next steps in one place."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
            {nl ? "Vernieuwen" : "Refresh"}
          </Button>
          <Button asChild>
            <Link to="/leads">
              {nl ? "Leads beheren" : "Manage leads"}
              <ArrowUpRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
      {isPending ? (
        <p role="status">{nl ? "Dashboard laden…" : "Loading dashboard…"}</p>
      ) : isError ? (
        <div role="alert" className="rounded-xl border p-6">
          {nl ? "Gegevens laden mislukt." : "Could not load data."}{" "}
          <Button variant="outline" onClick={() => refetch()}>
            {nl ? "Opnieuw proberen" : "Retry"}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ title, value, note, icon: Icon }) => (
              <div key={title} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  {title}
                  <Icon className="size-4 text-primary" />
                </div>
                <p className="my-3 text-3xl font-semibold tracking-tight">{value}</p>
                <p className="text-xs text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
          <DashboardInsights leads={leads} nl={nl} />
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <section className="rounded-2xl border bg-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl">{nl ? "Nieuwe leads per week" : "New leads per week"}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nl
                      ? "Laatste 8 weken · maandag–zondag · huidige week tot nu"
                      : "Last 8 weeks · Monday–Sunday · current week so far"}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                  {nl ? "Instroom" : "Incoming"}
                </span>
              </div>
              <div className="mt-6 flex h-40 items-end gap-3">
                {weeks.map((week, i) => (
                  <div
                    key={week.start.toISOString()}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-xs font-semibold">{week.count}</span>
                    <div
                      role="img"
                      aria-label={`${format(week.start, "dd/MM")}: ${week.count} leads`}
                      className={`w-full max-w-16 rounded-t-lg ${i === 7 ? "bg-primary" : "bg-primary/25"}`}
                      style={{
                        height: `${Math.max(2, (week.count / Math.max(1, ...weeks.map((w) => w.count))) * 95)}px`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {format(week.start, "dd/MM")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl bg-slate-900 p-6 text-white">
              <p className="text-xs tracking-widest text-slate-300">
                {nl ? "RESULTAAT" : "RESULTS"}
              </p>
              <h2 className="mt-4 text-3xl font-semibold">
                {formatMoney(won.reduce((n, l) => n + (l.value_estimate ?? 0), 0))}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                {nl ? "Geschatte waarde van gewonnen deals" : "Estimated value of won deals"}
              </p>
              <div className="mt-6 flex justify-between border-t border-white/15 pt-4 text-sm">
                <span>
                  {won.length} {nl ? "gewonnen" : "won"}
                </span>
                <span>
                  {leads.length} {nl ? "leads in totaal" : "total leads"}
                </span>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
