# Sales CRM

Independent React / TanStack Start application with Supabase authentication and PostgreSQL.

Run `npm install`, configure `.env` from `.env.example`, then run `npm run dev`.
Build with `npm run build`; start the resulting server with `node .output/server/index.mjs` and the server environment variables configured.

The production CRM is deployed at https://crm.verkoop.studio and uses its configured Supabase project. Preserve the populated production database; bootstrap scripts below are for a new empty installation only.

For the new project, run `supabase/bootstrap/fresh-crm.sql` once in its SQL editor. After the owner signs up, use `supabase/bootstrap/first-admin.sql` with the verified owner UUID. Configure Auth site/redirect URLs for the CRM. Google login requires your own Google provider configuration. Keep the service role key on the server only.

The MCP endpoint is `/mcp`, powered by the standard MCP SDK. Set `CRM_PUBLIC_URL` to the deployed HTTPS origin and enable the Supabase OAuth server with `/oauth/consent` as its authorization path before connecting an AI client. Website intake is available at `/api/public/inbound-lead` using a server-only intake token configured under Settings. The production intake and authenticated MCP endpoint were verified during the 2026-10-02 audit. Authorization in an external AI client must still be tested separately.

Validation: `npx tsc --noEmit`, `npm run test:integrations`, `npm run build`.

## Contract and quote attachments

Apply `supabase/migrations/20260930160000_lead_documents.sql` once to enable the private `lead-documents` bucket. Approved CRM users can upload PDF, Word, PNG, and JPEG files (up to 20 MB) to existing leads. Attachments are visible only to the uploading user and open through 60-second signed links. Server administrators retain administrative storage access. The dedicated Offertes & contracten page and lead details expose this section.

## Team invitations and removing access

Apply `supabase/migrations/20261002100000_team_management.sql` to the existing CRM database before deploying this version. Do **not** rerun the fresh bootstrap on a populated database. Set server-side `CRM_PUBLIC_URL` to the CRM's public HTTPS origin and keep the Supabase service role key server-only.

Under **Settings → Team & ownership**, administrators can create a personal invitation link, copy it, and send it themselves. No email is sent automatically. Supabase generates the one-use invite token and enforces its configured expiry. The recipient opens `/accept-invite`, chooses a password, and submits before the token is consumed (link previews do not consume invitations). Tokens live in URL fragments, not query parameters or server request logs. Copy the generated link before leaving Settings; it is not persisted in browser storage. For an expired, unused invitation, generate another link using the same email. Confirmed accounts use the normal sign-in flow.

**Remove member** revokes every CRM role, marks their access request declined, and unassigns their leads in one database transaction. Existing sessions lose access through RLS. Auth identity, profile, documents, and activity history remain intact; this is removal from the CRM team, not deletion of historical data or the Supabase identity. Administrators cannot remove themselves. Accounts without roles are not listed as eligible lead owners.

Validation: `npm run test:integrations`, `npx tsc --noEmit`, `npm run build`. Database regressions can be run with `psql -v ON_ERROR_STOP=1 -f tests/team-management.sql` **only against a new disposable local PostgreSQL database**; the script builds a mock Auth schema, loads the bootstrap and migration, and checks direct RPC permissions, access revocation, and history preservation. The hosted invitation lifecycle was verified with temporary accounts on 2026-10-02, including password login, one-use tokens and access revocation.

## Read-only reporting for Current

`GET /api/integrations/current/export` provides a narrow, read-only snapshot for a marketing dashboard. The endpoint stays disabled until an administrator configures these **server process environment variables** in the CRM deployment:

- `CURRENT_EXPORT_TOKEN`: a new cryptographically random 32-byte secret encoded as exactly 64 hexadecimal characters. Use a distinct token for this reporting connection; never reuse the website intake token, a user session, or a Supabase key. Do not prefix it with `VITE_`, log it, or commit it.
- `CURRENT_EXPORT_WORKSPACE_ID`: an immutable installation identifier, such as `verkoop-studio`. Use 3–100 lowercase letters, numbers, underscores or hyphens. The current CRM is one shared sales workspace; this identifier is a source binding, not a new tenant filter.

The existing `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` must already be configured. For development, supply the two `CURRENT_EXPORT_*` values in the process environment; the current Vite configuration does not automatically load them from `.env`. For production, set them in the hosting service environment and restart the server. No database migration is required.

Current sends `Authorization: Bearer <CURRENT_EXPORT_TOKEN>` from its backend to `https://crm.verkoop.studio/api/integrations/current/export`. Store the token encrypted for the selected dashboard business and verify the returned `workspaceId` on every import. Never request this endpoint from public browser code or put the token in a URL. Rotating or removing the environment token revokes the previous connection after the CRM process restarts.

The version 1 response contains `schemaVersion`, `workspaceId`, `currency: "EUR"`, `timezone: "Europe/Brussels"`, `generatedAt`, `complete`, `capabilities`, and `leads`. Each lead contains its stable ID, creation/update/deletion timestamps, stage, source, campaign and `valueEstimate`. It deliberately excludes customer identities, full notes, activities, documents and credentials. Read access to the entire installation's narrow reporting snapshot is delegated to anyone holding this token, so create a separate connection for each CRM installation.

`wonAt`, `wonValue`, `paidAt`, `paidRevenue`, and attribution `first`/`last` are currently `null`: the existing CRM does not store these facts. `updatedAt` must never be interpreted as the won date, and `valueEstimate` is not actual revenue. Legacy website UTM labels are returned only as explicitly unverified `attribution.legacyUtm`, with status `legacy_utm_notes`; absent or ambiguous notes remain `unknown`. They are not a verified first/last customer journey. Lead-date reports should use `createdAt` and label stages as the current status of that creation cohort, not conversions during that date range.

The endpoint includes soft-deleted records so the importer can remove them. It supports a complete snapshot of up to 1,000 records; exceeding the cap or receiving a truncated database result returns 409 rather than incomplete success. Missing setup returns 503, invalid credentials return 401, and database failures return a generic 503. A failed sync must preserve the dashboard's last good snapshot. Import and replace data only after validating the entire successful response, expected schema/workspace/currency and `complete: true`; deduplicate by workspace plus lead ID. Larger installations need a consistent pagination/snapshot contract before increasing this limit.

Validation: `npm run test:integrations`, `npm run build`, `npx tsc --noEmit`, then `node --experimental-strip-types tests/current-export-smoke.mjs`. The smoke checks start the built CRM against a local mock Data API with synthetic credentials; they never contact the production database. The generated TanStack route tree includes the export route. The production endpoint still requires administrator configuration and a live connection check before reporting it as connected.
