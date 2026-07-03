import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const SESSION_SECRET = process.env.SESSION_SECRET;

/**
 * Shared cookie + session middleware.
 * Exported so BOTH the Express app and the Socket.io engine can run them,
 * giving sockets the same authenticated session / signed cookies as HTTP routes.
 */
export const cookieParserMw = cookieParser(SESSION_SECRET);

export const sessionMw = session({
  store: new PgSession({
    conString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  },
});

/**
 * Collect all verified user IDs attached to a request (Express req or
 * socket.request). Mirrors the cross-role logic used by chat routes:
 * a single device may carry a pengguna session/cookie AND a mitra one.
 */
export function collectVerifiedIds(req: any): Set<number> {
  const ids = new Set<number>();
  const add = (v: unknown) => {
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) ids.add(n);
  };
  add(req?.session?.penggunaId);
  add(req?.session?.mitraId);
  add(req?.session?.merchantId);
  const pUid = req?.signedCookies?.["ride-p-uid"];
  if (pUid && pUid !== false) add(parseInt(pUid));
  const mUid = req?.signedCookies?.["ride-m-uid"];
  if (mUid && mUid !== false) add(parseInt(mUid));
  const mchUid = req?.signedCookies?.["ride-mch-uid"];
  if (mchUid && mchUid !== false) add(parseInt(mchUid));
  return ids;
}

export function hasMitraIdentity(req: any): boolean {
  if (req?.session?.mitraId) return true;
  const mUid = req?.signedCookies?.["ride-m-uid"];
  return !!(mUid && mUid !== false);
}

export function hasMerchantIdentity(req: any): boolean {
  if (req?.session?.merchantId) return true;
  const mchUid = req?.signedCookies?.["ride-mch-uid"];
  return !!(mchUid && mchUid !== false);
}

export function isAdminReq(req: any): boolean {
  return !!req?.session?.adminId;
}
