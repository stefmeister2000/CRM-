import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LeadDocumentsButton } from "@/components/LeadDocuments";
import { DealValueEditor } from "@/components/DealValueEditor";
import { useLanguage } from "@/hooks/use-language";
import { usePipelineLeads, pipelineQueryKey, type Lead } from "@/hooks/use-pipeline-leads";
import { STAGES, formatMoney, type Stage } from "@/lib/sales";
export const Route = createFileRoute("/_authenticated/prospectflow")({
  head: () => ({ meta: [{ title: "Prospectflow | Sales CRM" }] }),
  component: ProspectFlow,
});
const stageNames: Record<Stage, string> = {
  new: "Nieuw",
  contacted: "Gecontacteerd",
  engaged: "Interesse",
  meeting: "Afspraak",
  proposal: "Voorstel",
  won: "Gewonnen",
  lost: "Verloren",
};
const colors = ["#5276b4", "#7986cb", "#aa78bc", "#d29a47", "#de805e", "#40977f", "#8993a3"];
const queryKey = pipelineQueryKey;

function ProspectFlow() {
  const { language } = useLanguage();
  const nl = language === "nl";
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const saving = useRef(false);
  const label = (stage: Stage) =>
    nl ? stageNames[stage] : STAGES.find((s) => s.value === stage)!.label;
  const { data: leads = [], isPending, isError, refetch, isFetching } = usePipelineLeads();
  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { data, error } = await supabase
        .from("leads")
        .update({ stage })
        .eq("id", id)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Update failed");
    },
    onMutate: async ({ id, stage }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<Lead[]>(queryKey);
      client.setQueryData<Lead[]>(queryKey, (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, stage } : row)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
      toast.error(nl ? "Verplaatsen mislukt. Probeer opnieuw." : "Move failed. Please try again.");
    },
    onSuccess: (_data, { stage }) =>
      toast.success(`${nl ? "Verplaatst naar" : "Moved to"} ${label(stage)}`),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
      saving.current = false;
    },
  });
  function changeStage(id: string, stage: Stage) {
    if (
      saving.current ||
      leads.find((l) => l.id === id)?.stage === stage ||
      !leads.some((l) => l.id === id)
    )
      return;
    saving.current = true;
    move.mutate({ id, stage });
  }
  const filtered = leads.filter((l) =>
    `${l.company} ${l.contact_name ?? ""} ${l.email ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">{nl ? "Prospectflow" : "Prospect flow"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
            {nl ? "Vernieuwen" : "Refresh"}
          </Button>
          <Button asChild>
            <Link to="/leads">{nl ? "Leads beheren" : "Manage leads"}</Link>
          </Button>
        </div>
      </div>
      {isPending ? (
        <p role="status">{nl ? "Prospects laden…" : "Loading prospects…"}</p>
      ) : isError ? (
        <div role="alert">
          {nl ? "Laden mislukt." : "Loading failed."}
          <Button variant="outline" onClick={() => refetch()}>
            {nl ? "Opnieuw proberen" : "Retry"}
          </Button>
        </div>
      ) : (
        <section className="space-y-4" aria-label="Pipeline">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl">{nl ? "Jouw prospectflow" : "Your prospect flow"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {nl
                  ? "Sleep een kaart naar de juiste fase, of kies een fase op de kaart."
                  : "Drag a card to its next stage, or select a stage on the card."}
              </p>
            </div>
            <input
              type="search"
              aria-label={nl ? "Prospects zoeken" : "Search prospects"}
              placeholder={nl ? "Zoek een prospect…" : "Find a prospect…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-lg border bg-card px-3 text-sm"
            />
          </div>
          <p className="sr-only" role="status">
            {move.isPending ? (nl ? "Fase opslaan…" : "Saving stage…") : ""}
          </p>
          <div
            className="flex gap-3 overflow-x-auto pb-4"
            aria-label={nl ? "Pipelinefasen" : "Pipeline stages"}
          >
            {STAGES.map((stage, index) => {
              const cards = filtered.filter((l) => l.stage === stage.value);
              return (
                <section
                  key={stage.value}
                  aria-label={label(stage.value)}
                  onDragOver={(event) => {
                    if (!dragging || move.isPending) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOver(stage.value);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain");
                    setOver(null);
                    setDragging(null);
                    changeStage(id, stage.value);
                  }}
                  className={`min-h-72 w-64 shrink-0 rounded-xl border p-3 transition-colors ${over === stage.value ? "border-primary bg-primary/10" : "border-transparent bg-secondary/50"}`}
                >
                  <div className="mb-4 border-t-2 pt-3" style={{ borderColor: colors[index] }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{label(stage.value)}</h3>
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                        {cards.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMoney(cards.reduce((n, l) => n + (l.value_estimate ?? 0), 0))}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {cards.map((lead) => (
                      <article
                        key={lead.id}
                        draggable={!move.isPending}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", lead.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(lead.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        className={`rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md ${dragging === lead.id ? "opacity-40" : ""} ${move.isPending ? "" : "cursor-grab active:cursor-grabbing"}`}
                      >
                        <div className="flex items-start gap-2">
                          <h4 className="min-w-0 flex-1 break-words text-sm font-semibold">
                            {lead.company}
                          </h4>
                          <GripVertical
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lead.contact_name || (nl ? "Geen contactpersoon" : "No contact")}
                        </p>
                        <DealValueEditor
                          id={lead.id}
                          company={lead.company}
                          value={lead.value_estimate}
                          disabled={move.isPending}
                        />
                        <select
                          aria-label={`${nl ? "Fase voor" : "Stage for"} ${lead.company}`}
                          value={lead.stage}
                          disabled={move.isPending}
                          onChange={(event) => changeStage(lead.id, event.target.value as Stage)}
                          className="w-full rounded-md border bg-background p-2 text-xs"
                        >
                          {STAGES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {label(s.value)}
                            </option>
                          ))}
                        </select>
                        <LeadDocumentsButton id={lead.id} company={lead.company} />
                      </article>
                    ))}
                    {!cards.length && (
                      <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                        {search
                          ? nl
                            ? "Geen resultaten"
                            : "No matches"
                          : nl
                            ? "Sleep een prospect hierheen"
                            : "Drop a prospect here"}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
