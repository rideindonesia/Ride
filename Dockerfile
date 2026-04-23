# RIDE Production Build
FROM node:22

WORKDIR /app

RUN npm install -g pnpm@latest

COPY . .

RUN pnpm install --no-frozen-lockfile

# Build api-server backend (esbuild bundles db+api-zod internally)
RUN pnpm --filter @workspace/api-server run build

# Build ride-splash frontend
RUN PORT=8080 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/ride-splash run build

# Build ride-admin frontend
RUN PORT=8081 BASE_PATH=/admin/ NODE_ENV=production pnpm --filter @workspace/ride-admin run build

# Copy frontend outputs to api-server public dir
RUN mkdir -p artifacts/api-server/public && \
    cp -r artifacts/ride-splash/dist/public/. artifacts/api-server/public/ && \
    mkdir -p artifacts/api-server/public/admin && \
    cp -r artifacts/ride-admin/dist/public/. artifacts/api-server/public/admin/

EXPOSE 8080

CMD pnpm --filter @workspace/api-server run start
