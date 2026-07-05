# Single-container image: API + built frontend served by the same process.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# prisma.config.ts resolves DATABASE_URL even for `generate` — any value works at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci
COPY backend backend
RUN cd backend && npx prisma generate && npm run build

COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

FROM node:22-bookworm-slim
WORKDIR /app/backend
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3020 STATIC_DIR=/app/frontend/dist

# Full install kept on purpose: the prisma CLI is needed at startup for
# `migrate deploy`, and it lives in devDependencies.
COPY --from=build /app/backend/node_modules node_modules
COPY --from=build /app/backend/dist dist
COPY --from=build /app/backend/src/generated src/generated
COPY backend/package.json backend/prisma.config.ts ./
COPY backend/prisma prisma
COPY --from=build /app/frontend/dist /app/frontend/dist

EXPOSE 3020
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
