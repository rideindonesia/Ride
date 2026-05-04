// RIDE API Server — build trigger 2026-04-24c
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(
  session({
    store: new PgSession({
      conString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use("/api/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use("/api", router);

// Digital Asset Links — wajib untuk TWA Android
app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "id.ride.superapp",
        sha256_cert_fingerprints: [
          "53:9F:57:F7:CE:35:B7:23:10:AD:95:66:3C:5B:5B:73:66:C5:BC:30:36:5C:9E:AE:67:E9:BD:58:DF:7F:96:ED",
        ],
      },
    },
  ]);
});

const frontendDist = path.resolve(process.cwd(), "public");
const adminDist = path.resolve(process.cwd(), "public/admin");

// Middleware: no-cache for HTML, 1-year immutable for hashed assets
function noCacheHtml(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

app.use("/admin/assets", express.static(path.join(adminDist, "assets"), { maxAge: "1y", immutable: true }));
app.use("/admin", express.static(adminDist, { index: false }));
app.get("/admin/{*path}", noCacheHtml, (_req, res) => {
  res.sendFile(path.join(adminDist, "index.html"));
});

app.use("/assets", express.static(path.join(frontendDist, "assets"), { maxAge: "1y", immutable: true }));
app.use(express.static(frontendDist, { index: false }));
app.get("/{*path}", noCacheHtml, (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
