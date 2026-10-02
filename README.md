# Sales CRM

Independent React / TanStack Start application with Supabase authentication and PostgreSQL.

Run `npm install`, configure `.env` from `.env.example`, then run `npm run dev`.
Build with `npm run build`; start the resulting server with `node .output/server/index.mjs` and the server environment variables configured.

The previous database has been disconnected. The replacement project is pending creation in the Stef Keppens Sales CRM organization (tvjexlidzricyxpfrkaz). No existing leads or accounts will be copied.

For the new project, run `supabase/bootstrap/fresh-crm.sql` once in its SQL editor. After the owner signs up, use `supabase/bootstrap/first-admin.sql` with the verified owner UUID. Configure Auth site/redirect URLs for the CRM. Google login requires your own Google provider configuration. Keep the service role key on the server only.

The MCP endpoint is `/mcp`, powered by the standard MCP SDK. Set `CRM_PUBLIC_URL` to the deployed HTTPS origin and enable the Supabase OAuth server with `/oauth/consent` as its authorization path before connecting an AI client. Website intake is available at `/api/public/inbound-lead` using a server-only intake token configured under Settings. The local Stefmeister website is connected; production intake requires a public HTTPS CRM deployment. AI activation remains pending.

Validation: `npx tsc --noEmit`, `npm run test:integrations`, `npm run build`.

## Contract and quote attachments

Apply `supabase/migrations/20260930160000_lead_documents.sql` once to enable the private `lead-documents` bucket. Approved CRM users can upload PDF, Word, PNG, and JPEG files (up to 20 MB) to existing leads. Attachments are visible only to the uploading user and open through 60-second signed links. Server administrators retain administrative storage access. The dedicated Offertes & contracten page and lead details expose this section.

## Team invitations and removing access

Apply `supabase/migrations/20261002100000_team_management.sql` to the existing CRM database before deploying this version. Do **not** rerun the fresh bootstrap on a populated database. Set server-side `CRM_PUBLIC_URL` to the CRM's public HTTPS origin and keep the Supabase service role key server-only.

Under **Settings → Team & ownership**, administrators can create a personal invitation link, copy it, and send it themselves. No email is sent automatically. Supabase generates the one-use invite token and enforces its configured expiry. The recipient opens `/accept-invite`, chooses a password, and submits before the token is consumed (link previews do not consume invitations). Tokens live in URL fragments, not query parameters or server request logs. Copy the generated link before leaving Settings; it is not persisted in browser storage. For an expired, unused invitation, generate another link using the same email. Confirmed accounts use the normal sign-in flow.

**Remove member** revokes every CRM role, marks their access request declined, and unassigns their leads in one database transaction. Existing sessions lose access through RLS. Auth identity, profile, documents, and activity history remain intact; this is removal from the CRM team, not deletion of historical data or the Supabase identity. Administrators cannot remove themselves. Accounts without roles are not listed as eligible lead owners.

Validation: `npm run test:integrations`, `npx tsc --noEmit`, `npm run build`. Database regressions can be run with `psql -v ON_ERROR_STOP=1 -f tests/team-management.sql` **only against a new disposable local PostgreSQL database**; the script builds a mock Auth schema, loads the bootstrap and migration, and checks direct RPC permissions, access revocation, and history preservation. An end-to-end invitation against hosted Supabase still requires the configured CRM environment.
