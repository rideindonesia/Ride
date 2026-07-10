import http from "http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import { ensureSchema } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
initSocket(server);

ensureSchema()
  .catch((err) => logger.error({ err }, "ensureSchema failed (continuing)"))
  .finally(() => {
    server.listen(port, () => {
      logger.info({ port }, "Server listening (HTTP + Socket.io)");
    });
  });
