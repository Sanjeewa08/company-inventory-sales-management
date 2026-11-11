FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS operations

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
RUN DATABASE_URL="postgresql://127.0.0.1:5432/build?schema=public" npm run prisma:generate

FROM operations AS migrate

ENV NODE_ENV=production
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM operations AS create-initial-admin

ENV NODE_ENV=production
CMD ["npm", "run", "admin:create-initial"]

FROM operations AS seed-production-demo

ENV NODE_ENV=production
CMD ["npm", "run", "db:seed:production-demo"]

FROM operations AS build

COPY tsconfig.json tsconfig.build.json ./
RUN npm run build

FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/server.js"]
