FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace=apps/api --workspace=packages/db --no-audit --no-fund

COPY apps/api apps/api
COPY packages/db packages/db
COPY data/catalog.json data/catalog.json
RUN npm run build --workspace=apps/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/db packages/db
COPY --from=build /app/data data

USER node
EXPOSE 4000
CMD ["npm", "--prefix", "apps/api", "start"]
