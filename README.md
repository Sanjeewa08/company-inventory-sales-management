# Company Inventory & Sales Management System

A multi-branch inventory, purchasing, and sales management system. Work is organized
into incremental phases; Phases 1–4 and Phase 5 part A are implemented in the backend.

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
- Supplier management and draft purchase-order workflows with transactional PO numbering and approval/cancellation
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

## Phase 5 part A API scope

- `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`
- `POST/GET /purchase-orders`, `GET/PATCH /purchase-orders/:id`
- `POST /purchase-orders/:id/approve` (admin or manager) and
  `POST /purchase-orders/:id/cancel`

Purchase-order creation computes line totals and tax using decimal arithmetic and
allocates `PO-YYYY-NNNN` numbers through `DocumentSequence` in the same transaction.
Updates are limited to draft orders. Storekeepers may work with draft orders for
their own branch; managers and admins can approve and cancel approved orders.
The existing Phase 2 schema already provides the supplier, purchase-order, item,
and document-sequence tables, so Phase 5 part A adds no migration. Goods receipts
are intentionally not implemented in this phase part.

