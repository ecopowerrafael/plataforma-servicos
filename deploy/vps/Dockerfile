FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY apps/web/package*.json apps/web/
COPY packages/shared/package*.json packages/shared/
RUN npm ci

COPY . .
RUN npm run build:phase-a

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/api/package*.json apps/api/
COPY --from=build /app/apps/web/package*.json apps/web/
COPY --from=build /app/packages/shared/package*.json packages/shared/
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist

RUN mkdir -p /app/storage/uploads /app/storage/logs && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
