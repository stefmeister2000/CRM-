import { createFileRoute } from "@tanstack/react-router";
import { handleMcp } from "../lib/mcp/handler";
export const Route = createFileRoute("/mcp")({
  server: { handlers: { ANY: ({ request }) => handleMcp(request) } },
});
