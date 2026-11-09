# Meridian frontend

The frontend foundation uses React, Vite, TypeScript, Tailwind CSS, React Router,
Axios, Recharts, React Hook Form, and Zod. Business module pages are not included
in this increment.

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
