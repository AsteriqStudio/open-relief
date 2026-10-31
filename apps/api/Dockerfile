FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.setup.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared
RUN pnpm build

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install --no-install-recommends -y poppler-utils \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
