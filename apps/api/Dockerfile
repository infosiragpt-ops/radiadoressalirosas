FROM node:22-alpine AS build
WORKDIR /app

COPY apps/api/package*.json apps/api/
COPY packages/db/package*.json packages/db/
RUN npm --prefix apps/api install \
  && npm --prefix packages/db install

COPY apps/api apps/api
COPY packages/db packages/db
COPY . /context
RUN npm --prefix apps/api run build \
  && mkdir -p /app/data \
  && if [ -f /context/data/catalog.json ]; then cp /context/data/catalog.json /app/data/catalog.json; fi

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/db packages/db
COPY --from=build /app/data data

USER node
EXPOSE 4000
CMD ["npm", "--prefix", "apps/api", "start"]
