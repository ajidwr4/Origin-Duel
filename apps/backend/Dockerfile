FROM node:24.20.0-bookworm-slim AS build

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
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/src apps/backend/src
COPY packages/contracts-abi/tsconfig.json packages/contracts-abi/tsconfig.json
COPY packages/contracts-abi/src packages/contracts-abi/src
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/domain/src packages/domain/src

RUN npm run build --workspace=@origin-duel/domain \
    && npm run build --workspace=@origin-duel/contracts-abi \
    && npm run build --workspace=@origin-duel/backend

FROM node:24.20.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/package.json apps/backend/package.json
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/packages/contracts-abi/package.json packages/contracts-abi/package.json
COPY --from=build /app/packages/contracts-abi/dist packages/contracts-abi/dist
COPY --from=build /app/packages/domain/package.json packages/domain/package.json
COPY --from=build /app/packages/domain/dist packages/domain/dist

CMD ["node", "apps/backend/dist/index.js"]
