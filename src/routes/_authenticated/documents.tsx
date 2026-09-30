import { createFileRoute } from "@tanstack/react-router";
import { DocumentLibrary } from "@/components/DocumentLibrary";
import { DocumentsHero } from "@/components/LeadDocuments";
import { usePipelineLeads } from "@/hooks/use-pipeline-leads";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Offertes & contracten | Sales CRM" }] }),
  component: DocumentsPage,
});
function DocumentsPage() {
  const { language } = useLanguage();
  const nl = language === "nl";
  const { data: leads = [], isPending, isError, refetch } = usePipelineLeads();
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[.22em] text-primary">DOCUMENTS</p>
        <h1 className="break-words text-3xl sm:text-4xl">
          {nl ? "Offertes & contracten" : "Quotes & contracts"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {nl
            ? "Al je offertes en contracten overzichtelijk bij elkaar, gesorteerd op bedrijf."
            : "All your quotes and contracts in one place, sorted by company."}
        </p>
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
        <>
          <DocumentsHero leads={leads} />
          <DocumentLibrary leads={leads} nl={nl} />
        </>
      )}
    </div>
  );
}
