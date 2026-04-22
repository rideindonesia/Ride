# RIDE Production Build
  FROM node:22-alpine

  WORKDIR /app

  RUN npm install -g pnpm@latest

  COPY . .

  RUN pnpm install --no-frozen-lockfile

  RUN pnpm --filter @workspace/api-server... run build

  RUN mkdir -p artifacts/api-server/public && \
      cp -r artifacts/ride-splash/dist/public/. artifacts/api-server/public/

  EXPOSE 8080

  CMD pnpm --filter @workspace/api-server run start
  