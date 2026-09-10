# Admas

A luxury dark-themed lottery application built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

## Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Supabase
- Telegram Mini Apps SDK
- Lucide icons

## Folder structure

- app/ - route pages and global styles
- components/ - UI components
- lib/ - utility and Supabase clients

## Development

```bash
npm install
npm run dev
```

## Supabase setup

Create the following environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Then run the SQL migrations in the Supabase SQL editor, in order:
`schema.sql` → `migrations/002_hero_banners.sql` → `migrations/003_payment_transaction_reference.sql` → `migrations/004_unified_settings_and_support.sql`.

## Architecture decisions

### Unified ticket settings (single source of truth)

**Ticket Price** and **Total Tickets** are managed *only* in **Admin → App Settings**
(persisted in the single-row `app_settings` table — row `id = 1`, columns
`ticket_price` / `total_tickets`).

- The "Add New Lottery" form does **not** collect price/ticket inputs. It shows a
  read-only notice of the current global values instead.
- When a lottery is saved, the global values are injected automatically — enforced
  both client-side (`app/admin/page.tsx`) and server-side (`lib/admin/management.ts`).
- Saving a lottery fails with a clear error if the global settings are not configured.
- The home page (`app/page.tsx`) reads these settings dynamically, so changing them
  in the admin panel updates the storefront immediately.

### Lottery deletion

Each lottery item in the admin list has a **Delete** button. Deletion requires a
confirmation dialog ("Are you sure you want to delete this lottery?") and is exposed
server-side via `deleteLotteryItem()` (`POST /api/admin` with `type: "delete-lottery-item"`).

### Dynamic support team settings

Support Team contact info (username, contact, phone) is stored in the JSONB
`support` column of the single-row `app_settings` table (row `id = 1`) as
(`support_username`, `support_contact`, `support_phone`). Admins edit it from
**/admin → Support Manager**. This matches the existing
`get_support_username()` SQL function contract.

### Mandatory bank account selection at checkout

On the checkout flow, users **must select a bank payment account** before continuing
to the receipt upload step. The "Continue" button is disabled until an account is
selected, and attempting to proceed without one shows a clear warning notification.
