# Global Transport CRM

Enterprise CRM for coach, minibus, bus, airport transfer and chauffeur
transport operations. Full requirements: [`projectContext.md`](projectContext.md).
Build plan: `docs/` (see the plan saved in this session) — Phase 1
(Foundation: tenants, companies, brands, users, roles, permissions, audit)
is implemented here; later phases follow the roadmap.

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) — single app, role-based route groups
- **Supabase** — Postgres, Auth, Row-Level Security, Storage (later phases), Realtime (later phases)
- **Tailwind CSS** — Sunset Orange design system (`#f97316` primary, `#192233` sidebar)
- **Render** — web service hosting + cron jobs for scheduled work

## Project structure

```
app/
  (auth)/           login, accept-invite, reset-password — no session required
  (staff)/          internal CRM, gated by proxy.ts — requires a session
    dashboard/       Control Centre
    leads/ quotes/ accounting/ commissions/ attendance/
    email/ ai-optimisation/ business-intelligence/   ← full UI, demo data (later phase backend)
    bookings/ dispatch/ customers/ suppliers/ ...     ← placeholder screens (later phases)
    settings/        Phase 1 admin: users, roles & permissions, brands, audit log
components/
  layout/            Sidebar, Header, BrandSwitcher, nav config
  ui/                Panel, Kpi, PageHead, Alert, Toast, ModulePlaceholder, design system
  pages/              feature page components used by the routes above
  demo/               sample data for not-yet-backed modules — never production data
lib/
  supabase/          browser / server (RLS) / admin (service role) clients + types
  auth.ts             requireProfile() / getProfile()
  permissions.ts      permission key catalog + hasPermission()
  audit.ts             recordAudit() — the only way to write audit_log
  brand.ts             active brand resolution
supabase/
  migrations/0001_foundation.sql   tenants → brands → users/roles/permissions → audit, RLS
scripts/
  bootstrap-admin.mjs  creates the first tenant + company + brand + Master Admin
```

## Local setup

1. Create a Supabase project.
2. Apply the migration: open the SQL editor and run
   `supabase/migrations/0001_foundation.sql` (or `supabase db push` if you use
   the Supabase CLI with this repo linked).
3. Copy `.env.local.example` to `.env.local` and fill in the Supabase URL,
   anon key and service role key from **Project Settings → API**.
4. In **Authentication → Email Templates**:
   - **Invite user**: update its link to point at `/auth/confirm` instead of
     the default `{{ .ConfirmationURL }}` — required because this app uses
     PKCE/SSR auth, and Supabase's default template links don't carry a
     session through to a server-rendered app. Replace the link `href` with:
     ```
     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
     ```
   - **Reset Password**: this flow is code-only, deliberately not a link — a
     one-time link depends on nothing pre-visiting it before the real click,
     which isn't reliable in practice (a mail-side scanner or antivirus
     pre-fetching and burning the token before the person clicks is a known
     failure mode). Just add `{{ .Token }}` somewhere in the body, e.g.
     "Your reset code: **{{ .Token }}**" — the reset-password page has the
     person type this code in directly (`supabase.auth.verifyOtp`), no link
     needed.

   Set **Site URL** (same section) to your app's URL (`http://localhost:3000`
   locally, your Render URL in production) so `{{ .SiteURL }}` resolves
   correctly for the invite link.
5. Install and run:
   ```bash
   npm install
   npm run dev
   ```
6. Bootstrap the first Master Admin (creates a tenant, a company, a brand,
   and invites the admin — no plaintext password is ever generated):
   ```bash
   node --env-file=.env.local scripts/bootstrap-admin.mjs \
     --tenant "Global Transport CRM" \
     --company "Global Bus Rental Ltd" \
     --brand "Global Bus Rental" \
     --name "Your Name" \
     --email you@example.com
   ```
   Check that email for the Supabase invite link, set a password, and sign in.

## Deploying to Render

1. Push this repo to GitHub/GitLab.
2. In Render, **New → Blueprint**, point it at the repo — `render.yaml` at
   the root defines the web service.
3. Set the environment variables Render prompts for (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_APP_URL` — this should be the Render service's public URL so
   invite/reset links point at the right place).
4. Deploy. Health check is `/login`.
5. In Supabase, add the Render URL to **Authentication → URL Configuration**
   (Site URL + Redirect URLs) so invite/reset emails redirect correctly.

Cron jobs (quote expiry, lead-release SLA, dispatch escalation, document
expiry, daily brief) are commented out in `render.yaml` — they get uncommented
as their `/api/cron/*` route handlers are built in later phases.

## Email (SendGrid)

Two separate things send email, and both should point at SendGrid:

**1. The app's own transactional email** (quote sent, invites, payment
received, etc. — see `lib/email.ts` and `lib/emailTemplates.ts`) uses
`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM` from the environment. Nothing in the
code is SendGrid-specific — set:
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey                  # literally the string "apikey"
SMTP_PASS=<your SendGrid API key>
SMTP_FROM="Global Transport CRM <bookings@globalbusrental.com>"
```
`SMTP_FROM`'s address must be on a domain you've completed **Domain
Authentication** for in SendGrid (Settings → Sender Authentication), or
SendGrid rejects the send. A staff member with their own mailbox connected
(Settings → Users → Mailbox) sends from that mailbox instead — this only
covers the shared/automated sender.

Verify it works with a real send before wiring it into Render:
```bash
node --env-file=.env.local scripts/test-email.mjs --to you@example.com
```

**2. Supabase Auth's own email** — currently only the "Forgot your
password?" flow (`supabase.auth.resetPasswordForEmail`, and the default
**Reset Password**/**Invite user** templates referenced in step 4 above).
This is separate from `SMTP_*` and has a low built-in send limit. Fix it in
**Authentication → SMTP Settings**: enable Custom SMTP with the same
`smtp.sendgrid.net` / `apikey` / API-key details as above, then raise
**Authentication → Rate Limits** as a safety margin. While there, confirm
**Authentication → URL Configuration**'s Site URL and Redirect URLs
(`/accept-invite`, `/auth/confirm`) point at your real domain — a stale value
here is the usual cause of an invite link landing on a dead URL. Password
reset doesn't need a redirect URL at all — it's code-only (step 4 above), not
a link.

## What's real vs. demo in this build

**Backed by Supabase + RLS today:** authentication, tenants, companies,
brands, users, invites, roles, granular permissions, territories tables,
audit log, brand switching.

**UI ported from the design prototype, sample data, backend lands in a later
phase:** Control Centre charts, Leads, Quotes (5-step builder), Accounting,
Commissions, Attendance clock, Email Centre, AI Optimisation, Business
Intelligence. Bookings, Dispatch, Customers, Suppliers, WhatsApp, Calls, Live
Chat, Documents, Automations, KPIs, Team Chat, Tasks, Customer Experience and
Integrations are placeholder screens pending their build phase.

Never treat data in `components/demo/demoData.ts` as production data.
