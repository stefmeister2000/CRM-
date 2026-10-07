import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization",
    },
  });

export const Route = createFileRoute("/api/integrations/current/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { EXPORT_COLUMNS, EXPORT_LIMIT, exportLead, validExportToken } =
          await import("@/lib/current-export");
        const token = process.env["CURRENT_EXPORT_TOKEN"];
        const workspaceId = process.env["CURRENT_EXPORT_WORKSPACE_ID"];
        if (
          !token ||
          !/^[a-f0-9]{64}$/i.test(token) ||
          !workspaceId ||
          !/^[a-z0-9][a-z0-9_-]{2,99}$/.test(workspaceId) ||
          !process.env["SUPABASE_URL"] ||
          !process.env["SUPABASE_SERVICE_ROLE_KEY"]
        ) {
          return json({ error: "Reporting export is not configured." }, 503);
        }
        if (!validExportToken(request.headers.get("authorization"), token)) {
          return json({ error: "Invalid reporting token." }, 401);
        }
        // This server-only token is scoped to this CRM installation. No caller-
        // supplied workspace, SQL, columns, paths, pagination or filter is accepted.
        // Deliberately separate from the existing website intake token.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, count, error } = await supabaseAdmin
            .from("leads")
            .select(EXPORT_COLUMNS, { count: "exact" })
            .order("id")
            .range(0, EXPORT_LIMIT - 1)
            .abortSignal(AbortSignal.timeout(15_000));
          if (error || count == null || !data)
            return json({ error: "Could not read CRM reporting data." }, 503);
          // The importer only replaces its data after a complete export. Never
          // return a truncated success due to the PostgREST result limit.
          if (count > EXPORT_LIMIT || data.length !== count) {
            return json(
              {
                error: "CRM export exceeds the supported complete-export limit.",
                limit: EXPORT_LIMIT,
              },
              409,
            );
          }
          return json({
            schemaVersion: 1,
            workspaceId,
            currency: "EUR",
            timezone: "Europe/Brussels",
            generatedAt: new Date().toISOString(),
            complete: true,
            capabilities: {
              stageHistory: false,
              actualRevenue: false,
              firstLastAttribution: false,
            },
            leads: data.map(exportLead),
          });
        } catch {
          return json({ error: "CRM reporting is temporarily unavailable." }, 503);
        }
      },
    },
  },
});
