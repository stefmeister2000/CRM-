import { z } from "zod";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
export type ToolContext = {
  getToken: () => string;
  getUserId: () => string;
  isAuthenticated: () => boolean;
};
export function defineTool<S extends z.ZodRawShape>(tool: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
  handler: (input: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<CallToolResult>;
}) {
  return {
    ...tool,
    execute: (input: unknown, ctx: ToolContext) => tool.handler(z.object(tool.inputSchema).parse(input), ctx),
  };
}
