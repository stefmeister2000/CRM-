import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { crmTools } from "./index";
import { supabaseForUser } from "./supabase";
import type { ToolContext } from "./tool";

export function resourceOrigin(request: Request) {
  // A configured origin prevents untrusted proxy headers changing discovery URLs.
  return new URL(process.env["CRM_PUBLIC_URL"] || request.url).origin;
}

export function resourceMetadata(request: Request) {
  const databaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  if (!databaseUrl) return Response.json({ error: "Database setup pending" }, { status: 503 });
  return Response.json({
    resource: `${resourceOrigin(request)}/mcp`,
    authorization_servers: [`${databaseUrl.replace(/\/$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Sales CRM",
  });
}

export async function handleMcp(request: Request) {
  const origin = resourceOrigin(request);
  if (request.headers.has("origin") && request.headers.get("origin") !== origin) {
    return new Response("Origin not allowed", { status: 403 });
  }
  const unauthorized = () => Response.json({ error: "Authentication required" }, {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` },
  });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return unauthorized();
  let userId = "";
  const ctx: ToolContext = { getToken: () => token, getUserId: () => userId, isAuthenticated: () => !!userId };
  try {
    const db = supabaseForUser(ctx);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return unauthorized();
    userId = data.user.id;
    const roles = await db.from("user_roles").select("role").eq("user_id", userId).limit(1);
    if (roles.error) return Response.json({ error: "Could not verify CRM access" }, { status: 503 });
    if (!roles.data?.length) return Response.json({ error: "CRM account approval required" }, { status: 403 });
  } catch {
    return Response.json({ error: "Database connection unavailable" }, { status: 503 });
  }
  const server = new Server({ name: "sales-crm", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: crmTools.map(tool => ({
      name: tool.name, title: tool.title, description: tool.description, annotations: tool.annotations,
      inputSchema: z.toJSONSchema(z.object(tool.inputSchema)) as { type: "object" },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = crmTools.find(item => item.name === params.name);
    if (!tool) return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
    try { return await tool.execute(params.arguments ?? {}, ctx); }
    catch (error) {
      return { content: [{ type: "text", text: error instanceof z.ZodError ? "Invalid tool input" : "CRM operation failed" }], isError: true };
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

