import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  IMPORT_FIELDS,
  SOURCES,
  formatDate,
  guessMapping,
  labelFor,
  parseCsv,
  findDuplicate,
  type ImportFieldKey,
  type Source,
} from "@/lib/sales";

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "CSV import | Sales CRM" },
      {
        name: "description",
        content:
          "Upload manual CSV files from email tools, LinkedIn exports, ad platforms or call lists and map the columns to Sales CRM lead fields.",
      },
      { property: "og:title", content: "CSV import | Sales CRM" },
      {
        property: "og:description",
        content: "Map any CSV export into the shared Sales CRM lead database in a few clicks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<ImportFieldKey, string>>(
    {} as Record<ImportFieldKey, string>,
  );
  const [source, setSource] = useState<Source>("csv");
  const [campaign, setCampaign] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");
  const [lastResult, setLastResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const { data: existingLeads = [] } = useQuery({
    queryKey: ["leads-dedupe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company, contact_name, email, linkedin_url");
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast.error("That file has no data rows.");
      return;
    }
    const [head, ...body] = parsed;
    setFileName(file.name);
    setHeaders(head!);
    setRows(body);
    setMapping(guessMapping(head!));
  };

  const buildRows = useCallback(() => {
    const value = (row: string[], key: ImportFieldKey) => {
      const index = headers.indexOf(mapping[key] ?? "");
      const cell = index >= 0 ? row[index] : "";
      return cell && cell.length > 0 ? cell : null;
    };
    return rows
      .map((row) => {
        const company = value(row, "company");
        if (!company) return null;
        return {
          company,
          contact_name: value(row, "contact_name"),
          job_title: value(row, "job_title"),
          email: value(row, "email"),
          phone: value(row, "phone"),
          linkedin_url: value(row, "linkedin_url"),
          website: value(row, "website"),
          city: value(row, "city"),
          country: value(row, "country"),
          campaign: value(row, "campaign") ?? (campaign || null),
          notes: value(row, "notes"),
          source,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [campaign, headers, mapping, rows, source]);

  const split = useMemo(() => {
    if (headers.length === 0 || !mapping.company) {
      return {
        fresh: [] as ReturnType<typeof buildRows>,
        dupes: [] as { row: ReturnType<typeof buildRows>[number]; existingId: string }[],
      };
    }
    const parsed = buildRows();
    const fresh: typeof parsed = [];
    const dupes: { row: (typeof parsed)[number]; existingId: string }[] = [];
    const seen = [...existingLeads];
    for (const row of parsed) {
      const hit = findDuplicate(row, seen);
      if (hit) {
        dupes.push({ row, existingId: hit.id });
      } else {
        fresh.push(row);
        seen.push({
          id: `new-${seen.length}`,
          company: row.company,
          contact_name: row.contact_name,
          email: row.email,
          linkedin_url: row.linkedin_url,
        });
      }
    }
    return { fresh, dupes };
  }, [headers, mapping, existingLeads, buildRows]);

  const runImport = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      if (!mapping.company) throw new Error("Map the Company column first.");
      const { fresh, dupes } = split;
      if (fresh.length === 0 && (duplicateMode === "skip" || dupes.length === 0)) {
        throw new Error("Nothing new to import.");
      }

      let created = 0;
      let updated = 0;

      if (fresh.length > 0) {
        const { error } = await supabase
          .from("leads")
          .insert(fresh.map((row) => ({ ...row, owner_id: me.id, created_by: me.id })));
        if (error) throw error;
        created = fresh.length;
      }

      if (duplicateMode === "update") {
        for (const { row, existingId } of dupes) {
          const patch: LeadUpdate = {};
          const keys = [
            "contact_name",
            "job_title",
            "email",
            "phone",
            "linkedin_url",
            "website",
            "city",
            "country",
            "campaign",
            "notes",
          ] as const;
          for (const key of keys) {
            const value = row[key];
            if (value) patch[key] = value;
          }
          if (Object.keys(patch).length === 0) continue;
          const { error } = await supabase.from("leads").update(patch).eq("id", existingId);
          if (error) throw error;
          updated += 1;
        }
      }

      await supabase.from("import_batches").insert({
        file_name: fileName,
        source,
        campaign: campaign || null,
        row_count: rows.length,
        imported_count: created + updated,
        skipped_count: rows.length - created - updated,
        created_by: me.id,
      });
      return { created, updated, skipped: rows.length - created - updated };
    },
    onSuccess: (result) => {
      toast.success(
        `${result.created} created · ${result.updated} updated · ${result.skipped} skipped`,
      );
      setLastResult(result);
      setRows([]);
      setHeaders([]);
      setFileName("");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-dedupe"] });
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">CSV import</h1>
        <p className="text-sm text-muted-foreground">
          Drop in any export — email tool, LinkedIn list, ad platform or call sheet — and map the
          columns once.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload the file</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="csv">CSV file</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Channel these leads came from</Label>
            <Select value={source} onValueChange={(value) => setSource(value as Source)}>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign">Campaign / list name</Label>
            <Input
              id="campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="e.g. Antwerp corporate Q3"
            />
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                2. Map the columns ({rows.length} rows in {fileName})
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {IMPORT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>
                    {field.label}
                    {"required" in field && field.required ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[field.key] || "none"}
                    onValueChange={(value) =>
                      setMapping({ ...mapping, [field.key]: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not mapped</SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Preview & import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        {headers.map((_, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs">
                            {row[cellIndex] ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-primary">
                    {split.fresh.length} new · {split.dupes.length} already in the database
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Matched on email, then LinkedIn URL, then company + contact name.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>What to do with duplicates</Label>
                  <Select
                    value={duplicateMode}
                    onValueChange={(value) => setDuplicateMode(value as "skip" | "update")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip duplicates</SelectItem>
                      <SelectItem value="update">Update existing leads with new info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => runImport.mutate()} disabled={runImport.isPending}>
                <Upload className="size-4" /> Import {split.fresh.length} new
                {duplicateMode === "update" && split.dupes.length > 0
                  ? ` + update ${split.dupes.length}`
                  : ""}
              </Button>
              {lastResult && (
                <p className="text-sm text-muted-foreground">
                  Last run: {lastResult.created} created, {lastResult.updated} updated,{" "}
                  {lastResult.skipped} skipped.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {batches.length === 0 && <p className="text-sm text-muted-foreground">No imports yet.</p>}
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium">{batch.file_name}</span>
              <span className="text-muted-foreground">
                {labelFor(SOURCES, batch.source)} · {batch.imported_count} imported ·{" "}
                {formatDate(batch.created_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
