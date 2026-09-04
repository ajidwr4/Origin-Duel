FROM --platform=linux/amd64 node:24.20.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/renderer/package.json apps/renderer/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts-abi/package.json packages/contracts-abi/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json

RUN npm ci

COPY tsconfig.base.json tsconfig.node.json ./
COPY apps/renderer/tsconfig.json apps/renderer/tsconfig.json
COPY apps/renderer/src apps/renderer/src
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/domain/src packages/domain/src

RUN npm run build --workspace=@origin-duel/domain \
    && npm run build --workspace=@origin-duel/renderer

FROM --platform=linux/amd64 node:24.20.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/renderer/package.json apps/renderer/package.json
COPY --from=build /app/apps/renderer/dist apps/renderer/dist
COPY --from=build /app/packages/domain/package.json packages/domain/package.json
COPY --from=build /app/packages/domain/dist packages/domain/dist

CMD ["node", "apps/renderer/dist/index.js"]
