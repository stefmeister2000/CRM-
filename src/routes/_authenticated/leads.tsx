import { WebsiteRequest } from "@/components/WebsiteRequest";
import { usePipelineLeads } from "@/hooks/use-pipeline-leads";
import { LeadTextField } from "@/components/LeadTextField";
import { LeadDocuments } from "@/components/LeadDocuments";
import { DealValueEditor } from "@/components/DealValueEditor";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Star, Flag, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PipelineTracker, StageChip } from "@/components/PipelineTracker";
import {
  SOURCES,
  STAGES,
  CHANNELS,
  STAGE_META,
  labelFor,
  formatDate,
  priorityLabel,
  toCsv,
  downloadCsv,
  todayIso,
  type Source,
  type Stage,
  type Channel,
} from "@/lib/sales";

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (search: Record<string, unknown>): { lead?: string } =>
    typeof search["lead"] === "string" ? { lead: search["lead"] } : {},
  head: () => ({
    meta: [
      { title: "Leads & outreach log | Sales CRM" },
      {
        name: "description",
        content:
          "Search every Sales CRM lead, see who owns it, log email, LinkedIn, ads and cold-call touches, and move deals through the pipeline.",
      },
      { property: "og:title", content: "Leads & outreach log | Sales CRM" },
      {
        property: "og:description",
        content: "Shared lead database with ownership and a full outreach history per company.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

const EMPTY_LEAD = {
  company: "",
  contact_name: "",
  job_title: "",
  email: "",
  phone: "",
  linkedin_url: "",
  city: "",

  source: "email" as Source,
  stage: "new" as Stage,
  priority: "3",

  campaign: "",
  notes: "",
};

function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [listMode, setListMode] = useState("active");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; company: string } | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem("leads-owner-filter") ?? "all";
  });
  const changeOwnerFilter = (value: string) => {
    setOwnerFilter(value);
    if (typeof window !== "undefined") window.localStorage.setItem("leads-owner-filter", value);
  };

  const { lead: openLeadId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setOpenLeadId = (id: string | null) =>
    void navigate({ search: id ? { lead: id } : {}, replace: true });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LEAD);

  const {
    data: leads = [],
    isPending: leadsLoading,
    isError: leadsError,
    refetch: reloadLeads,
  } = usePipelineLeads(true);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, team");
      if (error) throw error;
      return data;
    },
  });

  const nameFor = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const createLead = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("leads").insert({
        company: form.company,
        contact_name: form.contact_name || null,
        job_title: form.job_title || null,
        email: form.email || null,
        phone: form.phone || null,
        linkedin_url: form.linkedin_url || null,
        city: form.city || null,

        source: form.source,
        stage: form.stage,
        priority: Number(form.priority),

        campaign: form.campaign || null,
        notes: form.notes || null,
        owner_id: me.id,
        created_by: me.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead added");
      setForm(EMPTY_LEAD);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateLead = useMutation({
    scope: { id: "lead-detail-updates" },
    mutationFn: async ({ id, patch }: { id: string; patch: LeadUpdate }) => {
      const { error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return leads.filter((lead) => {
      if (listMode === "trash" ? !lead.deleted_at : Boolean(lead.deleted_at)) return false;
      if (listMode === "flagged" && !lead.flagged) return false;
      if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
      if (ownerFilter === "mine" && lead.owner_id !== me?.id) return false;
      if (ownerFilter === "unassigned" && lead.owner_id) return false;
      if (!["all", "mine", "unassigned"].includes(ownerFilter) && lead.owner_id !== ownerFilter)
        return false;
      if (!term) return true;
      return [lead.company, lead.contact_name, lead.email, lead.city, lead.campaign]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [leads, listMode, search, sourceFilter, stageFilter, ownerFilter, me?.id]);

  // Every signed-in rep can update accounts: stage, value, notes and ownership.
  const canManageLead = (_lead: { owner_id: string | null; created_by: string | null }) =>
    Boolean(me);

  const actionsFor = (lead: {
    id: string;
    company: string;
    flagged: boolean;
    deleted_at: string | null;
  }) => (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      {lead.deleted_at ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!me || updateLead.isPending}
          onClick={() =>
            updateLead.mutate(
              { id: lead.id, patch: { deleted_at: null } },
              {
                onSuccess: () => {
                  setOpenLeadId(null);
                  toast.success("Lead hersteld");
                },
              },
            )
          }
        >
          <Undo2 className="mr-2 size-4" />
          Herstellen
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant={lead.flagged ? "secondary" : "outline"}
            aria-label={
              lead.flagged ? `Vlag verwijderen: ${lead.company}` : `Markeren: ${lead.company}`
            }
            aria-pressed={lead.flagged}
            disabled={!me || updateLead.isPending}
            onClick={() => updateLead.mutate({ id: lead.id, patch: { flagged: !lead.flagged } })}
          >
            <Flag
              className={`mr-2 size-4 ${lead.flagged ? "fill-amber-400 text-amber-600" : ""}`}
            />
            {lead.flagged ? "Gemarkeerd" : "Markeren"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            aria-label={`Verwijderen: ${lead.company}`}
            disabled={!me || updateLead.isPending}
            onClick={() => setDeleteTarget(lead)}
          >
            <Trash2 className="mr-2 size-4" />
            Verwijderen
          </Button>
        </>
      )}
    </div>
  );

  const exportCsv = () => {
    const headers = [
      "Company",
      "Contact",
      "Job title",
      "Email",
      "Phone",
      "LinkedIn",
      "Website",
      "City",
      "Country",
      "Channel",
      "Campaign",
      "Stage",
      "Importance",
      "Owner",
      "Last touch",
    ];
    const rows = filtered.map((lead) => [
      lead.company,
      lead.contact_name,
      lead.job_title,
      lead.email,
      lead.phone,
      lead.linkedin_url,
      lead.website,
      lead.city,
      lead.country,
      labelFor(SOURCES, lead.source),
      lead.campaign,
      STAGE_META[lead.stage as Stage].short,
      priorityLabel(lead.priority),

      nameFor(lead.owner_id),
      lead.last_touch_at ? formatDate(lead.last_touch_at) : "",
    ]);
    downloadCsv(`sales-crm-leads-${todayIso()}.csv`, toCsv(headers, rows));
    toast.success(`${rows.length} leads exported`);
  };

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="break-words text-3xl sm:text-4xl">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} leads ·{" "}
            {listMode === "trash" ? "Prullenbak" : listMode === "flagged" ? "Gemarkeerd" : "Actief"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Dialog
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>New lead</DialogTitle>
                <DialogDescription>
                  Log a company from any channel. You become the owner.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company *">
                  <Input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                </Field>
                <Field label="Contact name">
                  <Input
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  />
                </Field>
                <Field label="Job title">
                  <Input
                    value={form.job_title}
                    onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="LinkedIn URL">
                  <Input
                    value={form.linkedin_url}
                    onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  />
                </Field>
                <Field label="City">
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="Campaign / list">
                  <Input
                    value={form.campaign}
                    onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                  />
                </Field>
                <Field label="Source">
                  <Select
                    value={form.source}
                    onValueChange={(value) => setForm({ ...form, source: value as Source })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Pipeline stage">
                  <Select
                    value={form.stage}
                    onValueChange={(value) => setForm({ ...form, stage: value as Stage })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {STAGE_META[s.value].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Importance">
                  <Select
                    value={form.priority}
                    onValueChange={(value) => setForm({ ...form, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 4, 3, 2, 1].map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          {priorityLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes">
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createLead.mutate()}
                  disabled={!form.company || createLead.isPending}
                >
                  Save lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Leadweergave">
        {[
          { value: "active", label: "Actieve leads" },
          { value: "flagged", label: "Gemarkeerd" },
          { value: "trash", label: "Prullenbak" },
        ].map((mode) => (
          <Button
            key={mode.value}
            variant={listMode === mode.value ? "default" : "outline"}
            aria-pressed={listMode === mode.value}
            onClick={() => setListMode(mode.value)}
          >
            {mode.label}
          </Button>
        ))}
      </div>
      {listMode === "trash" && (
        <p className="text-sm text-muted-foreground">
          Verwijderde leads tellen niet mee in je dashboard of prospectflow. Je kunt ze hier
          herstellen, inclusief hun documenten en geschiedenis.
        </p>
      )}
      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <div className="relative min-w-0 basis-full sm:min-w-56 sm:flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search company, contact, city, campaign…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterSelect
            value={sourceFilter}
            onChange={setSourceFilter}
            allLabel="All channels"
            options={SOURCES}
          />
          <FilterSelect
            value={stageFilter}
            onChange={setStageFilter}
            allLabel="All stages"
            options={STAGES}
          />
          <Select value={ownerFilter} onValueChange={changeOwnerFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone's leads</SelectItem>
              <SelectItem value="mine">Only my leads</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {profiles
                .filter((p) => p.id !== me?.id)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? "Team member"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="w-full text-xs text-muted-foreground">
            Everyone on the sales team sees every lead added here — also the ones added by Claude or
            the website.
            {ownerFilter !== "all" && (
              <>
                {" "}
                You are looking at a filtered list.{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline"
                  onClick={() => changeOwnerFilter("all")}
                >
                  Show everyone's leads
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3 md:hidden">
        {filtered.map((lead) => (
          <article key={lead.id} className="rounded-xl border bg-card p-4">
            <button
              type="button"
              onClick={() => setOpenLeadId(lead.id)}
              className="min-h-11 w-full break-words text-left font-semibold text-primary"
            >
              {lead.company}
            </button>
            <p className="break-words text-sm">{lead.contact_name ?? "—"}</p>
            <p className="break-all text-xs text-muted-foreground">{lead.email ?? ""}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">{labelFor(SOURCES, lead.source)}</Badge>
              <StageChip
                stage={lead.stage}
                canEdit={canManageLead(lead) && !lead.deleted_at}
                onStageChange={(stage) => updateLead.mutate({ id: lead.id, patch: { stage } })}
              />
            </div>
            <p className="my-3 text-xs text-muted-foreground">{nameFor(lead.owner_id)}</p>
            {actionsFor(lead)}
          </article>
        ))}
        {leadsLoading && <p role="status">Loading leads…</p>}
        {leadsError && (
          <p role="alert">
            Could not load leads. <Button onClick={() => reloadLeads()}>Retry</Button>
          </p>
        )}
        {!leadsLoading && !leadsError && !filtered.length && (
          <p className="py-6 text-sm text-muted-foreground">No leads match these filters.</p>
        )}
      </div>
      <div className="panel hidden overflow-x-auto md:block">
        <Table className="leads-table">
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer"
                onClick={() => setOpenLeadId(lead.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    {lead.priority >= 4 && <Star className="size-3.5 text-primary" />}
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenLeadId(lead.id);
                      }}
                    >
                      {lead.company}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lead.city ?? "—"} · {priorityLabel(lead.priority)}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {lead.contact_name ?? "—"}
                  <p className="text-xs text-muted-foreground">{lead.email ?? ""}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{labelFor(SOURCES, lead.source)}</Badge>
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <StageChip
                    stage={lead.stage}
                    canEdit={canManageLead(lead) && !lead.deleted_at}
                    onStageChange={(stage) => updateLead.mutate({ id: lead.id, patch: { stage } })}
                  />
                </TableCell>

                <TableCell className="text-sm">{nameFor(lead.owner_id)}</TableCell>
                <TableCell>{actionsFor(lead)}</TableCell>
              </TableRow>
            ))}
            {leadsLoading && (
              <TableRow>
                <TableCell colSpan={6} role="status">
                  Loading leads…
                </TableCell>
              </TableRow>
            )}
            {leadsError && (
              <TableRow>
                <TableCell colSpan={6} role="alert">
                  Could not load leads. <Button onClick={() => reloadLeads()}>Retry</Button>
                </TableCell>
              </TableRow>
            )}
            {!leadsLoading && !leadsError && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={Boolean(openLead)} onOpenChange={(open) => !open && setOpenLeadId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openLead && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl">{openLead.company}</SheetTitle>
              </SheetHeader>
              <div className="pt-4">{actionsFor(openLead)}</div>
              <LeadDetail
                key={openLead.id}
                lead={openLead}
                ownerName={nameFor(openLead.owner_id)}
                profiles={profiles}
                canManage={Boolean(me) && !openLead.deleted_at}

                onPatch={(patch) => updateLead.mutateAsync({ id: openLead.id, patch })}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !updateLead.isPending && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lead verwijderen?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.company} wordt naar de prullenbak verplaatst. De aanvraag, documenten
              en geschiedenis blijven bewaard. Je kunt de lead later herstellen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={updateLead.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              disabled={updateLead.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                updateLead.mutate(
                  { id: deleteTarget.id, patch: { deleted_at: new Date().toISOString() } },
                  {
                    onSuccess: () => {
                      setDeleteTarget(null);
                      setOpenLeadId(null);
                      toast.success("Lead naar prullenbak verplaatst");
                    },
                  },
                );
              }}
            >
              Naar prullenbak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface LeadRow {
  website: string | null;
  value_estimate: number | null;
  id: string;
  company: string;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  campaign: string | null;

  source: string;
  stage: string;
  priority: number;

  notes: string | null;
  owner_id: string | null;
  created_by: string | null;
  last_touch_at: string | null;
}

function LeadDetail({
  lead,
  ownerName,
  profiles,
  canManage,
  onPatch,
}: {
  lead: LeadRow;
  ownerName: string;
  profiles: { id: string; full_name: string | null; email: string | null }[];
  canManage: boolean;
  onPatch: (patch: LeadUpdate) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [channel, setChannel] = useState<Channel>("email");
  const [notes, setNotes] = useState("");
  const [stageComment, setStageComment] = useState("");

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("lead_id", lead.id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const logActivity = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("activities").insert({
        lead_id: lead.id,
        user_id: me.id,
        channel,
        direction: "outbound",
        body: notes || null,
      });
      if (error) throw error;
      const { error: touchError } = await supabase
        .from("leads")
        .update({ last_touch_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (touchError)
        throw new Error("Activity saved, but the last-contact date could not be updated.");
    },
    onSuccess: () => {
      setNotes("");
      toast.success("Outreach logged");
      queryClient.invalidateQueries({ queryKey: ["activities", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["activities-recent"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stagePrefix = `[${lead.stage}] `;
  const stageComments = activities.filter(
    (activity) => activity.channel === "note" && (activity.body ?? "").startsWith(stagePrefix),
  );

  const addStageComment = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("activities").insert({
        lead_id: lead.id,
        user_id: me.id,
        channel: "note",
        direction: "outbound",
        body: `${stagePrefix}${stageComment.trim()}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setStageComment("");
      toast.success("Comment saved");
      queryClient.invalidateQueries({ queryKey: ["activities", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["activities-recent"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5 pt-4">
      <WebsiteRequest
        notes={lead.notes}
        source={lead.source}
        requests={activities.filter(
          (activity) => activity.direction === "inbound" && activity.channel === "note",
        )}
      />
      <section className="space-y-2 rounded-xl border p-4" aria-label="Contact">
        <p className="font-semibold">{lead.contact_name || lead.company}</p>
        {lead.email && (
          <a
            className="block break-all text-sm text-primary hover:underline"
            href={`mailto:${lead.email}`}
          >
            {lead.email}
          </a>
        )}
        {lead.phone && (
          <a
            className="block text-sm text-primary hover:underline"
            href={`tel:${lead.phone.replace(/[^+0-9]/g, "")}`}
          >
            {lead.phone}
          </a>
        )}
        {lead.website && <p className="break-all text-sm text-muted-foreground">{lead.website}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span className="text-sm">Fase</span>
          <Select
            value={lead.stage}
            disabled={!canManage}
            onValueChange={(stage) =>
              void onPatch({ stage: stage as Stage }).catch(() => undefined)
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((stage) => (
                <SelectItem key={stage.value} value={stage.value}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">Contactgegevens bewerken</summary>
        <div className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <LeadTextField
                label="Company"
                required
                value={lead.company}
                onSave={(value) => onPatch({ company: value })}
                disabled={!canManage}
              />
            </Field>
            <Field label="Contact name">
              <LeadTextField
                label="Contact name"
                value={lead.contact_name ?? ""}
                onSave={(value) => onPatch({ contact_name: value || null })}
                disabled={!canManage}
              />
            </Field>
            <Field label="Job title">
              <LeadTextField
                label="Job title"
                value={lead.job_title ?? ""}
                onSave={(value) => onPatch({ job_title: value || null })}
                disabled={!canManage}
              />
            </Field>
            <Field label="Email">
              <LeadTextField
                label="Email"
                value={lead.email ?? ""}
                onSave={(value) => onPatch({ email: value || null })}
                disabled={!canManage}
              />
            </Field>
            <Field label="Phone">
              <LeadTextField
                label="Phone"
                value={lead.phone ?? ""}
                onSave={(value) => onPatch({ phone: value || null })}
                disabled={!canManage}
              />
            </Field>
            <Field label="City">
              <LeadTextField
                label="City"
                value={lead.city ?? ""}
                onSave={(value) => onPatch({ city: value || null })}
                disabled={!canManage}
              />
            </Field>
            <Field label="Campaign">
              <LeadTextField
                label="Campaign"
                value={lead.campaign ?? ""}
                onSave={(value) => onPatch({ campaign: value || null })}
                disabled={!canManage}
              />
            </Field>
            <div className="flex flex-col justify-end pb-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last touch</p>
              <p className="text-sm">{formatDate(lead.last_touch_at)}</p>
            </div>
          </div>

          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              Open LinkedIn profile
            </a>
          )}
        </div>
      </details>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">Dealwaarde & documenten</summary>
        <div className="space-y-4 pt-4">
          <DealValueEditor
            id={lead.id}
            company={lead.company}
            value={lead.value_estimate}
            disabled={!canManage}
          />
          <LeadDocuments id={lead.id} />
        </div>
      </details>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Interne notities & opvolging
        </summary>
        <div className="space-y-5 pt-4">
          <Field label="Notes">
            <LeadTextField
              label="Notes"
              multiline
              value={lead.notes ?? ""}
              onSave={(value) => onPatch({ notes: value || null })}
              disabled={!canManage}
              placeholder="General notes about this account..."
            />
          </Field>

          <div className="panel space-y-3 p-4">
            <p className="font-display text-lg">Pipeline</p>
            <PipelineTracker
              stage={lead.stage}
              canEdit={canManage}
              onStageChange={(value) => void onPatch({ stage: value }).catch(() => undefined)}
            />
            {!canManage && (
              <p className="text-xs text-muted-foreground">Sign in again to move this lead.</p>
            )}

            <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Comments on this step — {STAGE_META[lead.stage as Stage]?.short ?? lead.stage}
              </p>
              {stageComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comment on this step yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {stageComments.map((comment) => (
                    <li key={comment.id} className="text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(comment.occurred_at)} —{" "}
                      </span>
                      {comment.body}
                    </li>
                  ))}
                </ul>
              )}
              <Textarea
                placeholder="Add a comment for this step..."
                value={stageComment}
                onChange={(e) => setStageComment(e.target.value)}
                disabled={!canManage}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!canManage || !stageComment.trim() || addStageComment.isPending}
                onClick={() => addStageComment.mutate()}
              >
                Save comment
              </Button>
            </div>
          </div>

          {canManage && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Importance">
                <Select
                  value={String(lead.priority)}
                  onValueChange={(value) =>
                    void onPatch({ priority: Number(value) }).catch(() => undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {priorityLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Owner">
                <Select
                  value={lead.owner_id ?? "none"}
                  onValueChange={(value) =>
                    void onPatch({ owner_id: value === "none" ? null : value }).catch(
                      () => undefined,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.email ?? "Team member"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <div className="panel space-y-3 p-4">
            <p className="font-display text-lg">Log outreach</p>
            <Field label="Channel">
              <Select value={channel} onValueChange={(value) => setChannel(value as Channel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea
                placeholder="What did you send or discuss?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <Button onClick={() => logActivity.mutate()} disabled={logActivity.isPending}>
              Log it
            </Button>
          </div>
        </div>
      </details>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Geschiedenis ({activities.length})
        </summary>
        <div className="space-y-2 pt-4">
          {activities.length === 0 && (
            <p className="text-sm text-muted-foreground">No outreach logged for this lead yet.</p>
          )}
          {activities.map((activity) => (
            <div key={activity.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{labelFor(CHANNELS, activity.channel)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(activity.occurred_at)}
                </span>
              </div>
              {activity.body && <p className="text-sm text-muted-foreground">{activity.body}</p>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}
