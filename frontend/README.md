# Meridian frontend

The frontend uses React, Vite, TypeScript, Tailwind CSS, React Router, Axios,
Recharts, React Hook Form, and Zod. It includes a live dashboard and product/category
catalog management pages.

The dashboard loads live product and low-stock counts for authenticated users,
sales and stock-valuation reports for ADMIN/MANAGER/ACCOUNTANT, branch-scoped
invoices for SALES and finance/management roles, and branch-scoped stock counts
for STOREKEEPER. Products and categories support search, status/category filtering,
pagination, details and forms; create, edit, activate and deactivate actions are
available only to ADMIN and MANAGER. Other business pages remain placeholders.

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
