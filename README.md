# Company Inventory & Sales Management System

A multi-branch inventory, purchasing, and sales management system. Work is organized
into incremental phases; Phase 1 (project setup) and Phase 2 (database schema) are
included in this starter.

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
service health response. `npm run build` creates the production JavaScript in
`backend/dist`; run it with `npm start`.

## Included

- Express and strict TypeScript backend skeleton
- Environment configuration loader
- Health endpoint and consistent global error handling
- Prisma 7 PostgreSQL schema, initial migration, and non-negative stock constraint
- Idempotent demo seed with branches, users, products, stock, purchase orders, and invoices
- Jest and Supertest test setup, ESLint, and Prettier
- PostgreSQL-only Docker Compose service

The demo users all use the password `Demo@1234`; their email addresses are
`admin@inventory.local`, `manager@inventory.local`, `storekeeper@inventory.local`,
`sales@inventory.local`, and `accountant@inventory.local`.

