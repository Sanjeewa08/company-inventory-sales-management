# Company Inventory & Sales Management System

A multi-branch inventory, purchasing, and sales management system. Work is organized
into incremental phases; Phases 1–6 and Phase 7 parts A–B are implemented in the backend.

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

The API listens on `http://localhost:3000` by default. Check `GET /health` for the
service health response and browse the API reference at `GET /api-docs`. Set
`JWT_SECRET` to a random secret of at least 32 characters in `.env`. `npm run build`
creates the production JavaScript in
`backend/dist`; run it with `npm start`.

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
no migration. Frontend components remain planned for Phase 8.

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

