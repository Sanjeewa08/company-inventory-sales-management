# Meridian frontend

The frontend uses React, Vite, TypeScript, Tailwind CSS, React Router, Axios,
Recharts, React Hook Form, and Zod. It includes a live dashboard, product/category
catalog management, stock/transfer management, supplier management, and purchase
orders.

The dashboard loads live product and low-stock counts for authenticated users,
sales and stock-valuation reports for ADMIN/MANAGER/ACCOUNTANT, branch-scoped
invoices for SALES and finance/management roles, and branch-scoped stock counts
for STOREKEEPER. Products and categories support search, status/category filtering,
pagination, details and forms; create, edit, activate and deactivate actions are
available only to ADMIN and MANAGER. Stock supports branch-scoped search and filters,
reason-required adjustments, and the backend's immediate transfer operation. Transfers
created in the current page session are shown as completed; the backend does not expose
a persisted transfer-history or approval/dispatch/receive workflow. Other business pages
remain placeholders. Suppliers support search, active-state filtering, sorting,
pagination, details and manager/admin create/edit/activation. Purchase orders support
search, status/supplier/branch filters, sorting, pagination, draft create/edit,
manager/admin approval, cancellation and partial/full receiving. Storekeepers are
restricted to their permitted branch by the backend and can only cancel draft orders.
The API does not support purchase-order date filters or a goods-receipt history list;
the interface displays received quantities and server-calculated order totals, and
shows the new receipt number in its confirmation.
Phase 8D and 8E add no database migration.

## Local setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

The app runs at `http://localhost:5173` and uses `VITE_API_BASE_URL` for the
backend URL (default: `http://localhost:3000`). Authentication calls the existing
`POST /auth/login` and `GET /auth/me` endpoints. Sign out is client-side because
the backend does not expose a logout route.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
