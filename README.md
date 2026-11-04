# Company Inventory & Sales Management System

A multi-branch inventory, purchasing, and sales management system. Work is organized
into incremental phases; only Phase 1 (project setup) is included in this starter.

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
npm run prisma:validate
npm test
npm run lint
npm run typecheck
npm run dev
```

The API listens on `http://localhost:3000` by default. Check `GET /health` for the
service health response. `npm run build` creates the production JavaScript in
`backend/dist`; run it with `npm start`.

There are no database migrations in Phase 1. The initial domain schema and migrations
are introduced in Phase 2.

## Phase 1 contents

- Express and strict TypeScript backend skeleton
- Environment configuration loader
- Health endpoint and consistent global error handling
- Prisma PostgreSQL tooling with an intentionally empty starter schema
- Jest and Supertest test setup, ESLint, and Prettier
- PostgreSQL-only Docker Compose service

