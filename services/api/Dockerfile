# Build a partir da raiz do monorepo:
#   docker build -f services/api/Dockerfile -t torquespec-api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile
COPY packages/shared-types packages/shared-types
COPY services/api services/api
RUN pnpm --filter @torquespec/shared-types build \
 && pnpm --filter @torquespec/api build \
 && pnpm --filter @torquespec/api deploy --prod --legacy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3333
# O mesmo image roda a API (padrão) ou o worker: `node dist/worker.js`
CMD ["node", "dist/server.js"]
