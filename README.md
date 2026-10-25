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

Under **Settings → Team & ownership**, administrators send a personal invitation by email. Every company uses the same server-side sender; the subject and message name the selected company and the link grants access only to it. Configure `RESEND_API_KEY` (sending-only, restricted to the verified sender domain) and `CRM_INVITATION_FROM` on the server before deployment. Keep Resend click and open tracking disabled for this domain so authentication links are not rewritten. Supabase generates the one-use invite token and enforces its configured expiry. The recipient opens `/accept-invite`, chooses a password, and submits before the token is consumed (link previews do not consume invitations). Tokens live in URL fragments, not query parameters or server request logs. Copy the generated link before leaving Settings; it is not persisted in browser storage. For an expired, unused invitation, generate another link using the same email. Confirmed accounts use the normal sign-in flow.

**Remove member** revokes every CRM role, marks their access request declined, and unassigns their leads in one database transaction. Existing sessions lose access through RLS. Auth identity, profile, documents, and activity history remain intact; this is removal from the CRM team, not deletion of historical data or the Supabase identity. Administrators cannot remove themselves. Accounts without roles are not listed as eligible lead owners.

Validation: `npm run test:integrations`, `npx tsc --noEmit`, `npm run build`. Database regressions can be run with `psql -v ON_ERROR_STOP=1 -f tests/team-management.sql` **only against a new disposable local PostgreSQL database**; the script builds a mock Auth schema, loads the bootstrap and migration, and checks direct RPC permissions, access revocation, and history preservation. The hosted invitation lifecycle was verified with temporary accounts on 2026-10-02, including password login, one-use tokens and access revocation.

## Multiple companies

The software operator can create companies under **Settings → Companies**. The sidebar company selector switches between the companies the signed-in person belongs to. Each company has its own leads, activities, imports, member roles, invitations and website token. Company administrators manage only their company; they cannot create other companies or promote themselves to software operator. Removing a member revokes only that company's access and preserves their other memberships and history.

Create a company, then use **Invite a team member** in its settings. The intended recipient automatically receives a personal invitation email; the link is also available to copy. New users set a password; existing users sign in with their existing account. Company invitations expire after seven days (the new-account authentication token can expire earlier according to Supabase settings). Creating another invitation for the same email in that company revokes the previous pending link. Pending invitations can also be revoked in Settings. Existing pending invitations are not emailed retroactively. Temporary email errors are retried up to three times with the same invitation ID as the Resend idempotency key. The UI only confirms sending after Resend accepts the message; if delivery acceptance is uncertain, it preserves the personal link and shows a warning so the administrator can share it or create a replacement invitation. Provider acceptance does not guarantee inbox delivery. Missing mail configuration fails before any invitation or Auth account is created.

### Coordinated production rollout

1. Take and verify a database backup. Review the current `admin` members: the migration preserves these existing trusted administrators as software operators. Future company administrators do not receive that privilege.
2. Apply `supabase/migrations/20261011094705_company_workspaces.sql` to the populated CRM database once. It requires the existing team-management and lead-document migrations. Existing records, roles, history, documents and settings remain attached to **Verkoop Studio** (`00000000-0000-4000-8000-000000000001`). The fresh bootstrap must never run against production.
3. Deploy this application revision immediately after the migration, before creating another company. Older clients remain compatible with basic single-company reads, but the former global invitation and role-write paths are deliberately disabled. Do not roll back to the old application after onboarding another company; use a forward fix or a coordinated restore.
4. Verify existing Verkoop leads, create a test company and invite a controlled test account. Confirm both companies remain isolated before inviting real client teams. Check website intake and document access as well.

For a new empty installation, establish the first administrator with the existing bootstrap instructions **before** applying the company migration. If no administrator exists at migration time, no software operator is created; a database administrator must explicitly assign the verified owner in `crm_private.platform_admins` and their Verkoop membership. There is no public self-promotion endpoint.

The browser sends the selected company on every database and server-function request; PostgreSQL validates current membership rather than trusting the header. Company changes reload the app to discard cached records and drafts. Missing company context is accepted only for an account with exactly one company. Database policies protect all application tables, the legacy contacts table when present, and storage access through the linked lead. Existing attachments retain their uploader-only visibility.

Website intake resolves the destination from a company-specific token and matches duplicate contacts only in that company. The legacy `INBOUND_LEAD_TOKEN` environment fallback is restricted to Verkoop Studio and disabled when its token is rotated. AI connections use the selected company's URL from Settings, `/mcp?company=<id>`. Existing generic `/mcp` connections must be updated for users who now belong to multiple companies.

### Verification

- `npm run test:integrations`
- `npx tsc --noEmit`
- `npm run build`
- `psql -v ON_ERROR_STOP=1 -d crm_company_test -f tests/company-workspaces.sql` against a **disposable local database named exactly `crm_company_test`**. This test recreates its schemas and verifies migration preservation, database-enforced isolation, forged and missing company context, parent/owner checks, member removal, storage visibility, invitation expiry/replacement/revocation, existing-user acceptance, and operator permissions. Never point it at production.

Browser checks used a local synthetic API fixture for company creation, switching and invitation controls; those checks do not establish a successful production rollout or a real Supabase invitation lifecycle.

## Personal website leads

Apply `20261011112632_website_contact_intake.sql` before deploying support for personal leads. The existing intake endpoint accepts `contactType: "person"` with a stable UUID `submissionId` and an email or phone. Company authorization still uses the company-specific intake token. A server-only database RPC atomically matches the person, writes their activity, and records the submission result. Retrying the same ID returns the original response without adding another activity. People with the same name are kept separate; requests for different companies remain isolated. Existing B2B requests keep their current behavior.

Database checks: run `tests/website-contact-intake.sql` only against the disposable local `crm_company_test` database, using the same prerequisites as the company-workspace checks.

## GA4 meetings from the CRM

Apply `supabase/migrations/20261016072038_ga4_crm_meetings.sql` before deploying. Website intake accepts an optional `ga4` object with the Google-generated `clientId` and `sessionId`, stores it through a service-only RPC, and keeps it out of contact notes and browser-readable tables. Intake remains successful if optional analytics storage is unavailable.

A committed transition of an attributed website lead into `meeting` queues `meeting_booked`, once per lead. This covers the board, lead editor and MCP because the database observes the stage update. Unattributed/imported leads and old meetings are not backfilled. The event contains the original browser client ID, a recent session ID when available, and the fixed method `sales_crm`; it never contains contact details, notes, company names or CRM record IDs. Google may limit campaign attribution for meetings long after the original visit.

Delivery uses a private outbox and the `crm-ga4-meetings` database job every minute. Configure a company-specific row in `crm_private.ga4_connections`, store its Measurement Protocol API secret in Supabase Vault under the referenced `secret_name`, validate the payload with Google's `/debug/mp/collect`, and only then set `enabled=true`. The Verkoop target is `G-VRKJP8K3SD`; other companies must not use this connection. Keep all secrets outside source control and browser code.

`submitted` means Google returned HTTP 2xx, not proof that the event appeared in reports. HTTP 429/5xx responses receive up to five attempts; ambiguous network outcomes are held as `uncertain` for manual review instead of blindly retrying. Pending events expire before Google's 72-hour backdating limit. A disabled/missing-secret connection does not send events. Inspect status counts in `crm_private.ga4_outbox` and the cron run history when diagnosing delivery; never print Vault secrets or request URLs containing them.

Validation: `npm run test:integrations`, `tsc --noEmit`, production build, and `tests/ga4-database.sql` (transaction-only rollback test, no external requests). The private tables intentionally have deny-by-default RLS and no client grants. Mark `generate_lead` and `meeting_booked` as key events in GA4 for conversion reporting.

## Current reporting export

`GET /api/integrations/current/export` lets the Current marketing dashboard read lead counts and stages, server-to-server. It needs no migration: the per-company token is stored in `app_settings` under `current_export_token`. Admins create, copy and rotate it, and copy the Workspace ID, in Settings → **Website requests** → **Current (marketing dashboard)**. Rotating the token immediately disables the old one.

The request must send `Authorization: Bearer <64 hex characters>`. The token alone selects the company, and a malformed or unknown token returns 401. Without the server-side Supabase configuration the endpoint returns 503, and other methods return 405. Responses use `Cache-Control: no-store`, are never redirected, and contain schema version 1 with workspace, currency, timezone and up to 1000 of the newest leads (including soft-deleted leads with `deletedAt`). If there are more, `complete` is `false`. Each lead carries only id, creation time, stage, value, source, campaign (max 200 characters) and category label: never names, email addresses, phone numbers, notes or company names.

Validation: `npm run test:integrations` (`tests/current-export.test.mjs`), `npx tsc --noEmit`, `npm run build`.
