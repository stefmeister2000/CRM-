import { AddTestLeads } from "@/components/AddTestLeads";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SOURCES, labelFor, formatDate } from "@/lib/sales";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Nieuwe leads | Sales CRM" },
      { name: "description", content: "Binnenkomende leads, met de nieuwste bovenaan." },
    ],
  }),
  component: Dashboard,
});

const PAGE_SIZE = 20;

function Dashboard() {
  const { language } = useLanguage();
  const nl = language === "nl";
  const [page, setPage] = useState(0);
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["leads", "incoming", page],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("leads")
        .select("id, company, contact_name, email, source, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { leads: data, total: count ?? 0 };
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl">{nl ? "Nieuwe leads" : "Incoming leads"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {nl
              ? "Alle binnenkomende leads, met de nieuwste bovenaan."
              : "All incoming leads, newest first."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddTestLeads />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {nl ? "Vernieuwen" : "Refresh"}
          </Button>
          <Button asChild>
            <Link to="/leads">{nl ? "Alle leads" : "All leads"}</Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{nl ? "Binnengekomen leads" : "Received leads"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p role="status">{nl ? "Leads laden…" : "Loading leads…"}</p>
          ) : isError ? (
            <div role="alert" className="space-y-3">
              <p>
                {nl ? "De leads konden niet worden geladen." : "The leads could not be loaded."}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                {nl ? "Opnieuw proberen" : "Try again"}
              </Button>
            </div>
          ) : data?.leads.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {nl
                ? "Nog geen leads om te tonen. Nieuwe leads verschijnen hier automatisch."
                : "No leads to display yet. New leads will appear here automatically."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{nl ? "Bedrijf" : "Company"}</TableHead>
                  <TableHead>{nl ? "Contactpersoon" : "Contact"}</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>{nl ? "Kanaal" : "Channel"}</TableHead>
                  <TableHead>{nl ? "Binnengekomen" : "Received"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.company}</TableCell>
                    <TableCell>{lead.contact_name || "—"}</TableCell>
                    <TableCell>{lead.email || "—"}</TableCell>
                    <TableCell>{labelFor(SOURCES, lead.source)}</TableCell>
                    <TableCell>{formatDate(lead.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isPending && !isError && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{data?.total ?? 0} leads</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {nl ? "Vorige" : "Previous"}
                </Button>
                <span className="text-sm">
                  {page + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * PAGE_SIZE >= (data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {nl ? "Volgende" : "Next"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
