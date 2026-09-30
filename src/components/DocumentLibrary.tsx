import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, ExternalLink, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { LeadDocumentsButton } from "@/components/LeadDocuments";
import { DOCUMENT_BUCKET, listLeadDocuments } from "@/lib/lead-documents";
import { supabase } from "@/integrations/supabase/client";

type Company = { id: string; company: string };
export function DocumentLibrary({ leads, nl }: { leads: Company[]; nl: boolean }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"quote" | "contract">("quote");
  const [sort, setSort] = useState("asc");
  const [opening, setOpening] = useState<string | null>(null);
  const ids = leads.map((lead) => lead.id).sort();
  const {
    data = [],
    isPending,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["document-library", ids],
    queryFn: async () => {
      // Limit concurrent storage requests while still including every prospect.
      const results: { id: string; documents: Awaited<ReturnType<typeof listLeadDocuments>> }[] =
        [];
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, ids.length) }, async () => {
          while (next < ids.length) {
            const id = ids[next++];
            if (id) results.push({ id, documents: await listLeadDocuments(id) });
          }
        }),
      );
      return results;
    },
    refetchInterval: 30_000,
  });
  const title = (name: string) => name.replace(/^[0-9a-f-]{36}__/, "");
  const term = search.trim().toLocaleLowerCase();
  const companies = data.map((group) => ({
    ...group,
    company: leads.find((lead) => lead.id === group.id)?.company ?? "—",
  }));
  const allDocuments = data.flatMap((group) => group.documents);
  const groups = companies
    .map((group) => ({
      ...group,
      documents: group.documents.filter(
        (doc) =>
          doc.category === kind &&
          (!term ||
            group.company.toLocaleLowerCase().includes(term) ||
            title(doc.name).toLocaleLowerCase().includes(term)),
      ),
    }))
    .filter((group) => group.documents.length)
    .sort(
      (a, b) =>
        (sort === "asc" ? 1 : -1) *
          a.company.localeCompare(b.company, nl ? "nl" : "en", {
            sensitivity: "base",
            numeric: true,
          }) || a.id.localeCompare(b.id),
    );
  async function openDocument(path: string) {
    setOpening(path);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const { data: link, error } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(path, 60);
      if (error) throw error;
      if (popup) popup.location.replace(link.signedUrl);
      else
        toast.error(
          nl ? "Sta pop-ups toe om het document te openen." : "Allow pop-ups to open the document.",
        );
    } catch {
      popup?.close();
      toast.error(nl ? "Document openen mislukt." : "Could not open document.");
    } finally {
      setOpening(null);
    }
  }
  return (
    <section
      className="space-y-5"
      aria-label={nl ? "Alle documenten per bedrijf" : "All documents by company"}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [
            nl ? "Bedrijven met documenten" : "Companies with documents",
            companies.filter((g) => g.documents.length).length,
          ],
          [nl ? "Offertes" : "Quotes", allDocuments.filter((d) => d.category === "quote").length],
          [
            nl ? "Contracten" : "Contracts",
            allDocuments.filter((d) => d.category === "contract").length,
          ],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{isPending || isError ? "—" : count}</p>
          </div>
        ))}
      </div>
      <Tabs value={kind} onValueChange={(value) => setKind(value as "quote" | "contract")}>
        <TabsList
          className="mb-5 grid h-12 w-full grid-cols-2 sm:max-w-lg"
          aria-label={nl ? "Documenttype" : "Document type"}
        >
          <TabsTrigger value="quote" className="h-10 gap-2">
            {nl ? "Offertes" : "Quotes"}
            <span className="rounded-full bg-primary/10 px-2 text-xs">
              {isPending || isError
                ? "—"
                : allDocuments.filter((d) => d.category === "quote").length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="contract" className="h-10 gap-2">
            {nl ? "Contracten" : "Contracts"}
            <span className="rounded-full bg-primary/10 px-2 text-xs">
              {isPending || isError
                ? "—"
                : allDocuments.filter((d) => d.category === "contract").length}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={kind} className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label={nl ? "Zoek bedrijf of document" : "Search company or document"}
                placeholder={nl ? "Zoek bedrijf of document…" : "Search company or document…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className="h-10 rounded-md border bg-card px-3 text-sm"
              aria-label={nl ? "Sorteren op bedrijf" : "Sort by company"}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="asc">{nl ? "Bedrijf A–Z" : "Company A–Z"}</option>
              <option value="desc">{nl ? "Bedrijf Z–A" : "Company Z–A"}</option>
            </select>
            <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
              {nl ? "Vernieuwen" : "Refresh"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {nl
              ? "Alle documenten waartoe je toegang hebt, per bedrijf. Binnen elk bedrijf staan de nieuwste bestanden bovenaan."
              : "All documents you can access, grouped by company. Newest files appear first within each company."}
          </p>
          {isPending ? (
            <p role="status">{nl ? "Documenten laden…" : "Loading documents…"}</p>
          ) : isError ? (
            <div role="alert" className="rounded-xl border p-6">
              {nl
                ? "Het documentenoverzicht kon niet volledig worden geladen."
                : "Could not load the complete document library."}
              <Button variant="link" onClick={() => refetch()}>
                {nl ? "Opnieuw proberen" : "Retry"}
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <FileText className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {allDocuments.some((d) => d.category === kind)
                  ? nl
                    ? "Geen documenten gevonden"
                    : "No matching documents"
                  : nl
                    ? kind === "quote"
                      ? "Nog geen offertes"
                      : "Nog geen contracten"
                    : kind === "quote"
                      ? "No quotes yet"
                      : "No contracts yet"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {allDocuments.some((d) => d.category === kind)
                  ? nl
                    ? "Pas je zoekterm aan."
                    : "Change your search."
                  : nl
                    ? "Upload hierboven een document bij een bedrijf. Het verschijnt hier automatisch."
                    : "Upload a document for a company above. It will appear here automatically."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <article key={group.id} className="overflow-hidden rounded-2xl border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Building2 className="size-5 shrink-0 text-primary" />
                    <div>
                      <h2 className="break-words text-lg font-semibold">
                        <Link to="/leads" search={{ lead: group.id }} className="hover:underline">
                          {group.company}
                        </Link>
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {group.documents.length} {nl ? "documenten" : "documents"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <LeadDocumentsButton id={group.id} company={group.company} initialKind={kind} />
                  </div>
                </header>
                <ul className="divide-y">
                  {group.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 px-5 py-4">
                      <FileText className="size-5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{title(doc.name)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {doc.category === "quote" ? (nl ? "Offerte" : "Quote") : "Contract"} ·{" "}
                          {doc.created_at
                            ? new Date(doc.created_at).toLocaleDateString(nl ? "nl-BE" : "en-GB")
                            : "—"}{" "}
                          · {Math.max(1, Math.round(Number(doc.metadata?.size ?? 0) / 1024))} KB
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={opening !== null}
                        aria-label={`Open ${title(doc.name)} — ${group.company}`}
                        onClick={() => openDocument(doc.path)}
                      >
                        <ExternalLink className="size-4" />
                        <span className="hidden sm:inline">Open</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
