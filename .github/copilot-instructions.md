# Project: Company Inventory & Sales Management System

## Overview
A production-style, multi-branch inventory, purchasing and sales system for a mid-size company.
Monorepo with `backend/` (REST API) and `frontend/` (React SPA). Built as a portfolio project,
so code quality, tests, documentation and a clean git history matter.

## How to work (READ FIRST)
- Work ONE phase at a time. The phase list is below.
- CURRENT PHASE: Phase 5 (update this line manually after each phase is finished and committed).
- If I don't name a phase in my message, work on the CURRENT PHASE above. Do NOT ask me which
  phase to work on.
- Do NOT implement anything from a later phase, even if it seems convenient.
- At the end of every phase: list files created, show the exact commands to verify
  (install, migrate, test, run), and suggest a Conventional Commit message.
- If something is ambiguous, make a sensible assumption, state it in one line, and continue.

## Build phases
1. Project setup: backend skeleton, TypeScript, Express, Prisma, ESLint/Prettier, jest,
   docker-compose with postgres only, .env.example, /health, error handler, config loader, README starter.
   (No business features, no frontend, no CI yet.) [DONE]
2. Database schema (full Prisma schema, CHECK constraint migration, seed script) [DONE]
3. Auth + users + RBAC + audit service [DONE]
4. Branches, categories, products, stock, transfers, low-stock alerts on stock change [DONE]
5. Suppliers + purchase orders + goods receipts
   [PART A IMPLEMENTED; GOODS RECEIPTS PENDING]
6. Customers + quotations + invoices + payments + PDF
7. Audit log endpoint, alerts cron job, reports
8. Frontend (React)
9. Production-ready: Dockerfiles, full docker-compose, GitHub Actions CI, security hardening,
   full Swagger, final README, deployment notes

## Tech stack
- Backend: Node.js (LTS), Express, TypeScript, Prisma ORM, PostgreSQL
- Auth: JWT (access token), bcrypt password hashing
- Validation: zod (every endpoint validates body, params and query)
- Docs: swagger-ui-express + OpenAPI spec at /api-docs
- Tests: jest + supertest (backend), vitest + React Testing Library (frontend, key flows only)
- PDF: pdfkit
- Scheduling: node-cron
- Frontend: React + Vite + TypeScript, react-router-dom, axios, recharts, Tailwind CSS
- DevOps: Docker, docker-compose (db + api + web), .env.example, GitHub Actions CI (lint + test)

## Architecture rules
- Backend folder structure: src/{config,middleware,modules,utils,prisma}
  Each module (auth, users, branches, products, stock, suppliers, purchase-orders,
  customers, quotations, invoices, reports, audit, alerts) has:
  `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (zod), `*.test.ts`.
- Controllers are thin. Business logic lives in services. Only services talk to Prisma.
- Use a global error-handling middleware with a custom AppError class and consistent JSON errors:
  `{ "error": { "code": string, "message": string, "details"?: any } }`
- Never trust client input. Validate everything with zod.
- Never return passwordHash in any response.
- Use async/await, no callbacks. Strict TypeScript, no `any` unless justified.
- All multi-table writes (stock transfer, goods receipt, invoice creation, payments)
  MUST run inside `prisma.$transaction`.
- Stock quantity must never go negative. Enforce in service layer and with a DB CHECK constraint.
- Every stock change creates a `StockMovement` row (types: PURCHASE, SALE, TRANSFER_IN,
  TRANSFER_OUT, ADJUSTMENT, RETURN) with a reference to the source document.
- Money: store as Decimal in Prisma, never floats.
- Pagination (`page`, `limit`) and sorting on all list endpoints.

## Roles and permissions (RBAC)
Roles: ADMIN, MANAGER, STOREKEEPER, SALES, ACCOUNTANT.
- ADMIN: everything, including user management and audit logs.
- MANAGER: approve purchase orders, view all branches, view reports, manage products/suppliers.
- STOREKEEPER: manage stock, adjustments, transfers, receive goods, ONLY for their own branch.
- SALES: customers, quotations, invoices; create invoices for own branch only.
- ACCOUNTANT: view invoices, record payments, view financial reports. Cannot edit stock.
Implement `authenticate` and `authorize(...roles)` middleware, plus branch scoping
(non-admin/manager users only see and modify their own branch data).

## Domain rules
- Multi-branch: each Branch has its own Stock rows (productId + branchId unique).
- Purchase flow: PO status DRAFT -> APPROVED (manager only) -> PARTIALLY_RECEIVED -> RECEIVED
  (or CANCELLED). Goods receipts (GRN) support partial receiving and increase stock.
  Over-receiving is rejected.
- Sales flow: Quotation (DRAFT/SENT/ACCEPTED/EXPIRED) can be converted to Invoice.
  Invoice status derives from payments: PENDING -> PARTIAL -> PAID (also CANCELLED).
  Creating an invoice checks and deducts stock in a transaction. Cancelling restores stock.
  Overpayment is rejected.
- Auto-generated document numbers: PO-2025-0001, INV-2025-0001, QT-2025-0001, GRN-2025-0001
  using a transaction-safe DocumentSequence table.
- Audit log: record userId, action (CREATE/UPDATE/DELETE/LOGIN/APPROVE...), entity, entityId,
  before/after JSON, ip, timestamp for every mutating operation. Implement via a reusable
  service/middleware, not copy-pasted code.
- Low stock: when Stock.quantity <= Product.reorderLevel create/refresh an Alert.
  A node-cron job runs daily to re-check.

## Coding conventions
- Use ESLint + Prettier. Conventional Commits (feat:, fix:, test:, docs:, chore:).
- Meaningful names, small functions, JSDoc on service methods.
- Write tests alongside every feature: happy path, validation error, 401/403, edge cases.
- Add Swagger annotations for every route as it is created.
- Seed script (`prisma/seed.ts`) creates 3 branches (Colombo, Kandy, Negombo), 5 demo users
  (one per role, password `Demo@1234`), 40+ products, categories, suppliers, customers,
  stock per branch, and some sample POs/invoices.
- Keep README updated as features land.

## Do not
- Do not hardcode secrets. Use environment variables.
- Do not commit .env files.
- Do not skip tests or validation to "move faster".
- Do not generate the whole project at once. Work phase by phase as described above.
- Do not refactor or rewrite files from earlier phases unless needed to fix a bug or
  integrate the current phase; mention it if you do.