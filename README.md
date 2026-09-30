# Sales CRM

Independent React / TanStack Start application with Supabase authentication and PostgreSQL.

Run `npm install`, configure `.env` from `.env.example`, then run `npm run dev`.
Build with `npm run build`; start the resulting server with `node .output/server/index.mjs` and the server environment variables configured.

The previous database has been disconnected. The replacement project is pending creation in the Stef Keppens Sales CRM organization (tvjexlidzricyxpfrkaz). No existing leads or accounts will be copied.

For the new project, run `supabase/bootstrap/fresh-crm.sql` once in its SQL editor. After the owner signs up, use `supabase/bootstrap/first-admin.sql` with the verified owner UUID. Configure Auth site/redirect URLs for the CRM. Google login requires your own Google provider configuration. Keep the service role key on the server only.

The MCP endpoint is `/mcp`, powered by the standard MCP SDK. Set `CRM_PUBLIC_URL` to the deployed HTTPS origin and enable the Supabase OAuth server with `/oauth/consent` as its authorization path before connecting an AI client. Website intake and AI activation remain pending.

Validation: `npx tsc --noEmit`, `npm run test:integrations`, `npm run build`.
