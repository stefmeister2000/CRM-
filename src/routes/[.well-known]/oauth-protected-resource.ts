import { createFileRoute } from "@tanstack/react-router";
import { resourceMetadata } from "../../lib/mcp/handler";
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: { handlers: { GET: ({ request }) => resourceMetadata(request) } },
});
