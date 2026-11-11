# Production deployment

This guide deploys the existing frontend to Vercel and the backend to the existing
Ubuntu VM. PostgreSQL remains in its existing Docker container and volume. The
production Compose file in this repository contains only the API and never creates,
replaces, or removes the database service.

The deployment uses this traffic path:

```text
Browser -> Vercel frontend -> HTTPS -> Nginx on the existing VM
        -> API container bound to 127.0.0.1:3000
        -> PostgreSQL at 172.16.0.4:5433 over the VM's private interface
```

## Safety and approval boundary

No Azure, DNS, firewall, Nginx, runtime-container, or database changes were made while
preparing this repository. Local image builds and configuration checks are validation
only. Review and approve infrastructure-changing commands before running them. In
particular, `prisma migrate deploy` changes the database schema; take and verify a
restorable backup first, review the pending migration list, and run it only after
explicit approval.

Do not run `docker compose down -v`, remove the PostgreSQL container, prune Docker
volumes, or change its port mapping as part of this deployment. Never publish port 5433
on a public interface. Do not copy real values into tracked files or paste secrets into
shell commands, tickets, or logs.

## Repository deployment files

- `backend/Dockerfile` has a non-root runtime image, a health check, and distinct
  `migrate`, interactive initial-admin, and production demo-data build targets. Client
  generation happens at image build time without using production credentials or
  connecting to a database.
- `backend/.dockerignore` excludes local environment files, dependencies, tests, and
  generated Prisma source from the build context.
- `docker-compose.production.yml` runs only the API by default, with separate
  manually-invoked migration, initial-admin, and production demo-data profiles. API port 3000 is published
  only on VM loopback for Nginx.
- `deploy/backend.env.example` is a placeholder template, not a usable credential
  file. Copy it to the ignored root `.env.production` and replace the placeholders
  privately.
- `deploy/nginx/company-inventory-api-bootstrap.conf` serves ACME challenges before a
  certificate exists. `deploy/nginx/company-inventory-api.conf` is the final HTTPS
  reverse-proxy template.
- `frontend/vercel.json` routes SPA paths to `index.html` for React Router deep links.

## 1. Configure private production environment

On the VM, from a checked-out and reviewed release of the repository:

```bash
cd /path/to/company-inventory-sales-management
cp deploy/backend.env.example .env.production
chmod 600 .env.production
nano .env.production
```

Set these values in the private file:

| Variable            | Required value                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL URL for `app_user` and `company_inventory` at `172.16.0.4:5433`; URL-encode special characters in the password. Add SSL parameters only if the existing PostgreSQL server is configured for TLS. |
| `JWT_SECRET`        | A randomly generated secret with at least 32 characters. Generate one with `openssl rand -hex 32`; store it only in the ignored environment file or a secret manager.                                       |
| `CORS_ORIGIN`       | Exact Vercel production origin, for example `https://your-frontend.vercel.app`. Multiple exact origins may be comma-separated.                                                                              |
| `TRUST_PROXY_HOPS`  | `1` when requests can reach the API only through this single Nginx proxy. Do not increase it without verifying the actual proxy chain.                                                                      |
| `NODE_ENV` / `PORT` | Keep `production` and `3000`.                                                                                                                                                                               |

The database URL template contains the known database username, database name, private
address, and port, but its password is intentionally a placeholder. Do not put an
unencoded password containing URL-reserved characters into the URL.

Validate Compose without printing resolved environment values:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

Avoid plain `docker compose config` in shared terminals because it prints interpolated
environment values. Confirm the existing PostgreSQL listener remains private and that
the VM firewall permits the API container's bridge-network traffic to the private
database address. Compose uses a bridge network with outbound access; it does not join
or reconfigure the existing database container's network.

## 2. Build and verify the backend image

These commands build images but do not start containers or connect to PostgreSQL:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml --profile migrate build migrate
```

The Dockerfile generates the Prisma client using a non-routable build-only URL; this is
not a database credential and is not included in the runtime environment. The API image
uses Node 22, runs as the unprivileged `node` user, listens on `0.0.0.0:3000` inside its
container, and passes a `/health` HTTP check. Docker publishes that port only as
`127.0.0.1:3000` on the VM.

## 3. Check and apply Prisma migrations

First inspect migration state. This command connects to the configured database but
does not apply migrations:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile migrate run --build --rm migrate ./node_modules/.bin/prisma migrate status
```

Review the output and the SQL files under `backend/prisma/migrations/`. After a verified
backup and explicit approval to alter the production schema, apply migrations with:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile migrate run --build --rm migrate
```

The migration image uses the installed Prisma 7 CLI and committed migration files.
Migrations are deliberately not run automatically during API startup, so scaled or
restarting API containers cannot race to migrate. Do not run `prisma db push`, `migrate
reset`, or the demo seed against production.

## 4. Create the initial ADMIN account

Only after migrations have completed successfully, create the first administrator
through the production-only interactive CLI:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile admin run --build --rm create-admin
```

The CLI asks for the administrator's name and email, then prompts twice for a password
without echoing it. Use a unique password of at least eight characters and store it in
your password manager. Credentials are not supplied as command-line arguments,
environment variables, or file contents. The CLI hashes the password using the
application's bcrypt cost (12), creates an `ADMIN` with no branch, and writes a safe
`CREATE` audit entry without password data. A transaction-scoped PostgreSQL advisory
lock prevents concurrent bootstrap attempts. It refuses to run outside
`NODE_ENV=production` or if any ADMIN already exists, including an inactive one.

This command creates a user row, so review and approve it before running. It does not
run the demo seed or change any other account. Once an ADMIN exists, use the normal
authenticated user-management API to create further accounts.

## 5. Start or update the API (approval required)

After migration approval/completion and review of the environment/network settings:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build api
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 api
curl --fail http://127.0.0.1:3000/health
```

`up` replaces or starts the API container and can cause a brief interruption. It does
not include or alter PostgreSQL. Do not scale multiple API replicas with this Compose
configuration: the current daily low-stock reconciliation is scheduled by each API
process, and the login rate limiter is process-local.

## 6. Configure Nginx and HTTPS on the existing VM (approval required)

Before changing Nginx, inspect existing sites and confirm ports 80 and 443 are available.
Point the chosen API DNS name to the existing VM's public address. In the two Nginx
templates, replace `api.example.com` with that DNS name. Configure the Azure network
security rules to allow inbound 80/443 as required, and ensure 5433 has no public allow
rule. Do not change the existing PostgreSQL container or volume.

Install Nginx/Certbot only if they are not already installed. Create the webroot, install
the bootstrap site without overwriting an unrelated existing site, test the config,
and reload only after reviewing the diff:

```bash
sudo apt update
sudo apt install -y nginx certbot
sudo install -d -m 0755 /var/www/certbot
sudo install -m 0644 deploy/nginx/company-inventory-api-bootstrap.conf /etc/nginx/sites-available/company-inventory-api
sudo ln -s /etc/nginx/sites-available/company-inventory-api /etc/nginx/sites-enabled/company-inventory-api
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d api.your-domain.example
```

Run the package-install command only if these packages are missing. If the `sites-enabled`
link already exists, inspect it rather than replacing it.

After the certificate is issued, install the final template (with the domain replaced),
then validate before reloading:

```bash
sudo install -m 0644 deploy/nginx/company-inventory-api.conf /etc/nginx/sites-available/company-inventory-api
sudo nginx -t
sudo systemctl reload nginx
```

Enable the site using the VM's established Nginx process; if a site with that name
already exists, stop and review it rather than replacing it. The final proxy forwards
the original host, client address, and HTTPS scheme to the loopback-only API. The
backend trusts exactly one proxy hop by default in production Compose. Keep the API
container port inaccessible from external networks.

Verify certificate renewal is configured and that `https://api.your-domain.example/health`
returns the expected health response. The health endpoint currently checks process
responsiveness, not PostgreSQL readiness.

## 7. Deploy the frontend to Vercel

Create or update the Vercel project using:

- **Root Directory:** `frontend`
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Production environment variable:** `VITE_API_BASE_URL=https://api.your-domain.example`

Set `VITE_API_BASE_URL` in Vercel's environment settings and redeploy; Vite embeds it at
build time. It is a public API origin, not a place for secrets. Do not set it to the
private VM IP or include an API path prefix. `vercel.json` provides the `index.html`
rewrite for React Router routes.

Set the backend `CORS_ORIGIN` to the exact deployed Vercel origin. If Vercel preview
deployments need API access, add only the exact preview origins intended for use; this
backend does not support wildcard origin patterns. CORS is browser policy, not API
authentication.

## 8. Security and operational checks

- Keep PostgreSQL reachable only through its private interface. A Docker port binding
  is not a substitute for Azure network rules; verify public inbound 5433 is denied.
- Keep `.env.production` out of Git and restrict its permissions. Do not put secrets in
  Docker build arguments, frontend variables, image layers, or deployment logs.
- Use a unique random `JWT_SECRET`, exact CORS origins, HTTPS, and the API's existing
  authentication/authorization. The API documentation endpoint is currently public.
- The login rate limiter uses in-memory state. It is suitable only for this single API
  container; a future multi-replica deployment needs a shared rate-limit store and a
  dedicated/singleton scheduler for the daily alert job.
- `TRUST_PROXY_HOPS=1` is safe only while the API is reachable exclusively through
  Nginx. Keep the host-published API port loopback-only and review the proxy chain
  before changing this value.
- The sample env file is for configuration shape only; it has no usable password or
  JWT secret. The development seed is never used in production.

## 9. Optional production demonstration data

The separate `seed-demo` profile creates the fictional, interconnected
`production-demo-v1` dataset. The planned additions are 2 branches, 5 categories,
5 suppliers, 10 customers, 18 products, 36 branch/product stock rows, 48 stock
movements, 3 purchase orders (one approved, one partially received, one received),
2 goods receipts, 3 quotations (draft, sent, converted), 5 invoices (3 pending,
1 partial, 1 paid), 2 payment records, 2 active low-stock alerts, and 103 audit
entries. It also allocates 13 document numbers through the existing
`DocumentSequence` rows. All company, supplier, and customer details are fictional;
email addresses use the reserved `.example` domain. No users are created, and no
ADMIN account or credential is changed.

The seeder requires production mode and an existing active ADMIN. It takes a
transaction-scoped advisory lock, checks for pre-existing reserved demo identifiers
and document-number collisions, inserts the dataset atomically, and records a
version marker. It creates no duplicates when rerun after success. It never deletes
or overwrites existing business records; if it detects a collision or any
verification fails, the transaction rolls back. Document sequence counters may
advance as normal when new purchase orders, receipts, quotations, and invoices are
created.

First build and run the read-only preview. It reports planned counts and available
document numbers; it does not allocate sequence numbers or write database rows:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile demo-data run --build --rm seed-demo npm run db:seed:production-demo -- --dry-run
```

Review the preview and ensure the displayed plan matches the intended changes before
running the approved production insert:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile demo-data run --build --rm seed-demo
```

The command is intentionally separate from API startup and from the development
`prisma/seed.ts` script. A completed version is marked in the audit log; a repeated
run reports `already-seeded` and adds nothing. No migration is required.
