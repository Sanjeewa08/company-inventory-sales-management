# Company Inventory & Sales Management System

A multi-branch inventory, purchasing, and sales management system. Work is organized
into incremental phases; Phases 1–6 and Phase 7 parts A–B are implemented in the backend.
Phase 8 parts A–G provide the frontend foundation, live dashboard, catalog, stock and
transfers, suppliers and purchase orders, sales, and admin user management.

## Prerequisites

- Node.js 22 or newer
- npm
- Docker Compose (for the PostgreSQL service)

## Local setup

From the project root, copy `.env.example` to `.env` and replace the local database
password with a value of your choice. The `.env` file is ignored by Git.

```powershell
Copy-Item .env.example .env
docker compose up -d db
Set-Location backend
npm install
npm run prisma:generate
npx prisma migrate dev
npx prisma db seed
npm run prisma:validate
npx prisma migrate status
npm test
npm run lint
npm run typecheck
npm run dev
```

The included demo seed is for local development only and refuses to run unless
`NODE_ENV=development`. Do not use demo accounts or run the demo seed against production
data. The listed demo credentials are intended only for a local development database.

The API listens on `http://localhost:3000` by default. Check `GET /health` for the
service health response and browse the API reference at `GET /api-docs`. Set
`JWT_SECRET` to a random secret of at least 32 characters in `.env`. `npm run build`
creates the production JavaScript in
`backend/dist`; run it with `npm start`.
The API allows browser requests from `http://localhost:5173` by default; configure
`CORS_ORIGIN` in `.env` with comma-separated origins when deploying the frontend elsewhere.
The Compose database service is for local development and binds its published port to
loopback. For production deployment to the existing Azure VM and PostgreSQL Docker
service, follow [DEPLOYMENT.md](DEPLOYMENT.md). The production Compose file runs only
the API, binds it to loopback for the Nginx HTTPS proxy, and does not create, replace,
or manage the PostgreSQL container or volume. Production migrations are a separate,
explicit step; do not run the development seed or use sample database credentials.
After applying migrations, create the first production administrator using the
interactive `create-admin` profile documented in
[DEPLOYMENT.md](DEPLOYMENT.md#4-create-the-initial-admin). It requests the password
without echoing it and refuses to create another ADMIN. The production bootstrap is
separate from the demo seed.

## Included

- Express and strict TypeScript backend skeleton
- Environment configuration loader
- Health endpoint and consistent global error handling
- JWT authentication, role-based user management, branch scoping, audit logging, and Swagger API docs
- Branch, category, product, and stock APIs with role-based access and pagination
- Atomic stock adjustments and inter-branch transfers with movement history and low-stock alert refresh
- Supplier management and purchase-order workflows, including transactional numbering, approval, cancellation, and partial goods receipts
- Customer management and quotation workflows with branch-scoped sales access and transactional quotation numbering
- Invoice creation, branch stock deduction, cancellation/stock restoration, and low-stock alert refresh
- Invoice payments with transactional status updates and downloadable PDF invoices
- Admin audit-log browsing, low-stock alert management, and scheduled alert reconciliation
- Read-only sales, stock-valuation, top-product, branch-comparison, and outstanding-payment reports
- React frontend with JWT login, protected role navigation, reusable UI components, and role-aware live dashboard metrics
- Product and category management pages with search, filtering, pagination, forms, and role-gated mutations
- Stock management with branch/category/status filters, reason-required adjustments, and immediate inter-branch transfers
- Prisma 7 PostgreSQL schema, initial migration, and non-negative stock constraint
- Idempotent demo seed with branches, users, products, stock, purchase orders, and invoices
- Jest and Supertest test setup, ESLint, and Prettier
- PostgreSQL-only Docker Compose service

The demo users all use the password `Demo@1234`; their email addresses are
`admin@inventory.local`, `manager@inventory.local`, `storekeeper@inventory.local`,
`sales@inventory.local`, and `accountant@inventory.local`.

## Phase 4 API scope

- `GET/POST /branches`, `PATCH/DELETE /branches/:id`
- `GET/POST /categories`, `PATCH/DELETE /categories/:id`
- `GET/POST /products`, `PATCH/DELETE /products/:id`
- `GET /stock`, `POST /stock/adjustments`, and `POST /stock/transfers`

Branch, category, and product deletion deactivates records. Non-admin/non-manager
branch and stock reads are scoped to the caller's branch; storekeeper adjustments
and transfer sources are likewise restricted. Stock operations create movements
and refresh or resolve the corresponding low-stock alert within the same
transaction. The existing Phase 2 schema supports these features, so Phase 4 adds
no migration. `GET /stock` supports paginated branch, product, search (name/SKU/barcode),
category, and stock-status filters. Stock adjustment requests require a reason in
`notes`. Frontend stock management is available in Phase 8D.

## Phase 5 API scope

- `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`
- `POST/GET /purchase-orders`, `GET/PATCH /purchase-orders/:id`
- `POST /purchase-orders/:id/approve` (admin or manager) and
  `POST /purchase-orders/:id/cancel`
- `POST /purchase-orders/:id/receive` (storekeeper for own branch; manager/admin for any branch)

Purchase-order creation computes line totals and tax using decimal arithmetic and
allocates `PO-YYYY-NNNN` numbers through `DocumentSequence` in the same transaction.
Updates are limited to draft orders. Storekeepers may work with draft orders for
their own branch; managers and admins can approve and cancel approved orders.
Goods receipts allocate `GRN-YYYY-NNNN` numbers transactionally, accept partial
quantities, reject over-receiving, and atomically update purchase-order quantities,
branch stock, purchase stock movements, and low-stock alerts. Receipt and purchase
order changes are audit-logged. The existing Phase 2 schema already provides the
supplier, purchase-order, goods-receipt, stock-movement, and document-sequence
tables, so Phase 5 adds no migration.

## Phase 6 parts A–C API scope

- `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id`
- `POST/GET /quotations`, `GET/PATCH /quotations/:id`
- `POST /quotations/:id/send`, `/accept`, `/expire`, and `/convert`
- `POST/GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/cancel`
- `POST/GET /invoices/:id/payments`, `GET /invoices/:id/pdf`

Customer records are company-wide master data because the existing customer model
has no branch field. Sales users can access only quotations for their assigned
branch; managers and admins can access any branch. Quotation creation uses decimal
totals and transaction-safe `QT-YYYY-NNNN` numbering. Only draft quotations can be
edited; sending, accepting, and expiring are audited state transitions.
`POST /quotations/:id/convert` returns invoice-ready data only; it does not create
an invoice or deduct stock. Posting `POST /invoices` with an accepted `quotationId`
creates the linked invoice and marks the quotation converted.
Invoice amounts use Decimal arithmetic with fixed-amount discounts. Invoice
creation atomically checks and deducts branch stock, records `SALE` movements, and
refreshes low-stock alerts. Cancelling an unpaid invoice with no payments restores
stock and writes `RETURN` movements in the same transaction. Sales users are
restricted to their branch, while managers/admins can operate across branches and
accountants can read invoices and record payments. Payments are transactional,
reject overpayment and cancelled invoices, and transition invoice status from
`PENDING` to `PARTIAL` to `PAID`. Sales users may read payments but cannot record
them; all payment and invoice status changes are audit-logged. The invoice PDF
includes customer and line-item details, totals, paid amount, balance, and status.
Phase 6 adds a migration for the invoice discount column and converted quotation
status; no additional migration is needed for payments or PDF generation.

## Phase 7 parts A and B API scope

- `GET /audit-logs` (admin only), with user, entity, action, date-range, pagination,
  and sorting filters
- `GET /alerts/low-stock` (branch-scoped for every non-admin role) and
  `PATCH /alerts/:id/acknowledge`
- `GET /reports/sales`, `/reports/stock-valuation`, `/reports/top-products`,
  `/reports/branch-comparison`, and `/reports/outstanding-payments`

Audit-log entries expose the actor's safe profile fields and recorded before/after
values. Alert acknowledgements are audit-logged and do not resolve the underlying
low-stock condition. A daily reconciliation refreshes active low-stock alerts and
resolves alerts for stock that is above its product reorder level. The schedule
defaults to midnight and is configurable using `LOW_STOCK_ALERT_CRON`; the job is
started by the API server, not by application or test imports. Phase 7 part A uses
the existing schema and requires no migration. Reports are read-only and use
PostgreSQL aggregations with Decimal-safe monetary output. Managers and admins can
access every report; accountants can access sales, stock valuation, and outstanding
payments. No reports are available to other roles. Phase 7 parts A and B add no
database migration.

## Frontend setup (Phase 8 parts A-G)

From the project root, configure the frontend API URL and start Vite:

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

The frontend defaults to `http://localhost:3000` for its API base URL; override it
with `VITE_API_BASE_URL` in `frontend/.env.local` when needed. The login uses the
implemented `POST /auth/login` and session restore uses `GET /auth/me`. Sign out
clears the client token because the backend has no logout endpoint. Role-specific
navigation, a live dashboard, product/category management, stock management,
supplier management, and purchase orders are implemented. Stock reads are
branch-scoped for non-admin/non-manager roles; adjustments and immediate transfers
are available to ADMIN, MANAGER, and STOREKEEPER. The stock API has no durable
transfer-history or approval/dispatch/receive endpoints, so the UI only shows
transfers completed during the current session. Purchase orders support draft
creation/editing, manager/admin approval, cancellation, and partial/full receipt
using the existing APIs. The API does not expose purchase-order date-range filters
or a goods-receipt history endpoint; received quantities are shown and the receipt
number is returned in the receipt confirmation. Phase 8D and 8E require no database
migration.
Customer, quotation, and invoice pages use the existing Phase 6 APIs. Customers support
search, filtering, details, create/edit, and activation/deactivation; quotations support
search/filtering, draft editing, send/accept/expire, details, and starting invoice creation
from an accepted quotation. Invoice creation, filtering, details, payment history and
role-authorized payment entry, cancellation, and PDF download are available. Invoice
filters use the backend's status, customer, branch, issue-date, and sort options; the API
does not provide invoice text search. Quotation rejection and conversion-history actions
are not exposed by the backend. Phase 8F adds no database migration.
User management is available to ADMIN only and uses the existing `GET/POST /users`,
`PATCH /users/:id`, and `DELETE /users/:id` endpoints. The list supports name/email,
role, branch, active-state filters, and pagination; details are shown from the safe user
list response because there is no individual-user GET endpoint. Passwords are set only
when creating an account: there is no admin password-reset endpoint, and password hashes
are never requested or displayed. Non-admin/non-manager users need a branch assignment
for branch-scoped APIs. Deactivation is soft-delete; inactive accounts can be reactivated
with the supported PATCH operation. Phase 8G adds no database migration.
The navigation entries for branches, alerts, audit logs, and reports still lead to
placeholder pages; the corresponding backend APIs are available but do not yet have
dedicated frontend management screens. The backend supports changing the signed-in
user's password, but the frontend has no password-change form. To deploy the frontend,
set `VITE_API_BASE_URL` to the reachable API URL at build time, configure backend
`CORS_ORIGIN` for the deployed frontend origin, and configure the static host to fall
back to `index.html` for BrowserRouter paths. Use HTTPS in production; the frontend
stores its short-lived bearer token in browser localStorage.
Phase 8C adds an optional unique product barcode for catalog search; apply its additive
database migration with `npx prisma migrate dev` from `backend/`.
Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` from
`frontend/` to verify the app.

## Production deployment

The repository includes a multi-stage backend Dockerfile, an API-only production Compose
file, Nginx bootstrap/TLS templates, and Vercel SPA routing. See
[DEPLOYMENT.md](DEPLOYMENT.md) for environment setup, migration gates, HTTPS, Vercel
configuration, and verification. No cloud, firewall, DNS, Nginx, container, or database
deployment commands are run by the development workflow.

