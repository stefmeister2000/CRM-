import { currentExportMethodNotAllowed, handleCurrentExportRequest } from "@/lib/current-export";
import { createFileRoute } from "@tanstack/react-router";

// Server-to-server reporting export for Current; no CORS, no redirects, no contact details.
export const Route = createFileRoute("/api/integrations/current/export")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleCurrentExportRequest(request, {
          configured: Boolean(
            process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"],
          ),
          admin: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
        }),
      // HEAD is answered by GET; every other method gets a JSON 405, never the app shell.
      ANY: () => currentExportMethodNotAllowed(),
    },
  },
});
