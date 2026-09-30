import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, ExternalLink, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { DOCUMENT_BUCKET as BUCKET, listLeadDocuments } from "@/lib/lead-documents";
const MAX_SIZE = 20 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
type Kind = "contract" | "quote";

export function LeadDocumentsButton({
  id,
  company,
  initialKind = "quote",
}: {
  id: string;
  company: string;
  initialKind?: Kind;
}) {
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();
  const nl = language === "nl";
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start gap-2 px-1 text-xs"
        onClick={() => setOpen(true)}
        aria-label={`${nl ? "Documenten voor" : "Documents for"} ${company}`}
      >
        <Paperclip className="size-3" />
        {nl ? "Contracten & offertes" : "Contracts & quotes"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{nl ? "Contracten & offertes" : "Contracts & quotes"}</DialogTitle>
            <DialogDescription>{company}</DialogDescription>
          </DialogHeader>
          <LeadDocuments id={id} initialKind={initialKind} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeadDocuments({ id, initialKind = "quote" }: { id: string; initialKind?: Kind }) {
  const { language } = useLanguage();
  const nl = language === "nl";
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const queryKey = ["lead-documents", id];
  const {
    data: documents = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listLeadDocuments(id),
  });
  const upload = useMutation({
    mutationFn: async ({ selected, category }: { selected: File; category: Kind }) => {
      const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
      const contentType = MIME[extension];
      if (!contentType || selected.size > MAX_SIZE || selected.size === 0)
        throw new Error("invalid_file");
      const safeName = selected.name
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
        .slice(-180);
      const path = `${id}/${category}/${crypto.randomUUID()}__${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, selected, { contentType, upsert: false });
      if (error) throw error;
    },
    onSuccess: async () => {
      setFile(null);
      if (input.current) input.current.value = "";
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: ["document-library"] }),
      ]);
      toast.success(nl ? "Document geüpload" : "Document uploaded");
    },
    onError: () =>
      setMessage(
        nl
          ? "Upload mislukt. Je bestand is behouden; probeer opnieuw."
          : "Upload failed. Your selected file is retained; please retry.",
      ),
  });
  async function openDocument(path: string) {
    setOpening(path);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
      if (error) throw error;
      if (popup) popup.location.replace(data.signedUrl);
      else
        toast.error(
          nl ? "Sta pop-ups toe om het document te openen." : "Allow pop-ups to open the document.",
        );
    } catch {
      popup?.close();
      toast.error(
        nl ? "Document openen mislukt. Probeer opnieuw." : "Could not open document. Please retry.",
      );
    } finally {
      setOpening(null);
    }
  }
  return (
    <section
      className="space-y-4"
      aria-label={nl ? "Contracten en offertes" : "Contracts and quotes"}
    >
      <div>
        <h3 className="text-lg font-semibold">
          {nl ? "Contracten & offertes" : "Contracts & quotes"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {nl
            ? "Alleen zichtbaar voor jou als uploader. PDF, Word, PNG of JPG · maximaal 20 MB per bestand."
            : "Visible only to you as the uploader. PDF, Word, PNG or JPG · up to 20 MB per file."}
        </p>
      </div>
      <form
        className="space-y-3 rounded-xl border border-dashed bg-secondary/30 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) {
            setMessage("");
            upload.mutate({ selected: file, category: kind });
          }
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>{nl ? "Documenttype" : "Document type"}</span>
          <select
            className="w-full rounded-md border bg-background p-2"
            value={kind}
            disabled={upload.isPending}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="quote">{nl ? "Offerte" : "Quote"}</option>
            <option value="contract">Contract</option>
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span>{nl ? "Bestand kiezen" : "Choose file"}</span>
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={upload.isPending}
            className="block w-full min-w-0 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              const extension = selected?.name.split(".").pop()?.toLowerCase() ?? "";
              if (
                selected &&
                (!MIME[extension] || selected.size > MAX_SIZE || selected.size === 0)
              ) {
                setFile(null);
                e.target.value = "";
                setMessage(
                  nl
                    ? "Kies een PDF, Word, PNG of JPG tussen 1 byte en 20 MB."
                    : "Choose a PDF, Word, PNG or JPG between 1 byte and 20 MB.",
                );
                return;
              }
              setFile(selected);
              setMessage("");
            }}
          />
        </label>
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <Button type="submit" disabled={!file || upload.isPending} className="gap-2">
          <Upload className="size-4" />
          {upload.isPending
            ? nl
              ? "Uploaden…"
              : "Uploading…"
            : nl
              ? "Document uploaden"
              : "Upload document"}
        </Button>
        {upload.isPending && (
          <p role="status" className="text-xs">
            {nl
              ? "Even wachten tot het uploaden klaar is."
              : "Please wait for the upload to finish."}
          </p>
        )}
      </form>
      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {nl ? "Documenten laden…" : "Loading documents…"}
        </p>
      ) : isError ? (
        <div role="alert" className="text-sm">
          {nl ? "Documenten laden mislukt." : "Could not load documents."}
          <Button variant="link" onClick={() => refetch()}>
            {nl ? "Opnieuw proberen" : "Retry"}
          </Button>
        </div>
      ) : documents.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {nl ? "Nog geen documenten voor deze prospect." : "No documents for this prospect yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {doc.name.replace(/^[0-9a-f-]{36}__/, "")}
                </p>
                <p className="text-xs text-muted-foreground">
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
                onClick={() => openDocument(doc.path)}
                aria-label={`${nl ? "Open" : "Open"} ${doc.name.replace(/^[0-9a-f-]{36}__/, "")}`}
              >
                <ExternalLink className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DocumentsHero({ leads }: { leads: { id: string; company: string }[] }) {
  const { language } = useLanguage();
  const nl = language === "nl";
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const lead = leads.find((item) => item.id === selected);
  return (
    <section
      id="documents"
      className="scroll-mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-5 sm:p-6"
      aria-label={nl ? "Documentencentrum" : "Document centre"}
    >
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
            <FileText className="size-6" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">
              {nl ? "Contracten & offertes" : "Contracts & quotes"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {nl
                ? "Van voorstel tot handtekening. Alle documenten bij de juiste prospect."
                : "From proposal to signature. Keep documents with the right prospect."}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            aria-label={nl ? "Prospect voor documenten" : "Prospect for documents"}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border bg-card px-3 text-sm sm:w-64"
          >
            <option value="">{nl ? "Kies een prospect…" : "Choose a prospect…"}</option>
            {[...leads]
              .sort((a, b) => a.company.localeCompare(b.company))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.company}
                </option>
              ))}
          </select>
          <Button disabled={!lead} className="gap-2" onClick={() => setOpen(true)}>
            <Upload className="size-4" />
            {nl ? "Documenten openen" : "Open documents"}
          </Button>
        </div>
      </div>
      {!leads.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          {nl ? "Voeg eerst een prospect toe via Leads." : "Add a prospect in Leads first."}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{nl ? "Contracten & offertes" : "Contracts & quotes"}</DialogTitle>
            <DialogDescription>{lead?.company}</DialogDescription>
          </DialogHeader>
          {lead && <LeadDocuments key={lead.id} id={lead.id} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
