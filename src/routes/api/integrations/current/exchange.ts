import {
  currentExchangeMethodNotAllowed,
  handleCurrentExchangeRequest,
} from "@/lib/current-connect";
import { createFileRoute } from "@tanstack/react-router";

// Server-to-server: Current trades the single-use code from the connect page for the reporting token.
export const Route = createFileRoute("/api/integrations/current/exchange")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleCurrentExchangeRequest(request, {
          configured: Boolean(
            process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"],
          ),
          admin: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
        }),
      ANY: () => currentExchangeMethodNotAllowed(),
    },
  },
});
