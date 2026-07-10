import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { collectVerifiedIds } from "../lib/session";

// In-memory throttle so we don't write to the DB on every single request.
// Records the last time we persisted lastActiveAt per user id.
const lastWritten = new Map<number, number>();
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
let lastSweep = 0;

// Prune stale entries so the map can't grow unbounded over a long-lived
// process. An entry older than THROTTLE_MS is useless — the next request from
// that user is allowed to write again regardless — so it's safe to drop.
function sweep(now: number) {
  if (now - lastSweep < THROTTLE_MS) return;
  lastSweep = now;
  for (const [id, ts] of lastWritten) {
    if (now - ts > THROTTLE_MS) lastWritten.delete(id);
  }
}

/**
 * Updates users.last_active_at (throttled) for any verified user identity on
 * the request, so admins can see when a mitra/user last used the app.
 * Fire-and-forget: never blocks or fails the request.
 */
export function trackLastActive(req: Request, _res: Response, next: NextFunction) {
  try {
    const ids = collectVerifiedIds(req);
    if (ids.size > 0) {
      const now = Date.now();
      sweep(now);
      const toUpdate: number[] = [];
      for (const id of ids) {
        if (now - (lastWritten.get(id) ?? 0) > THROTTLE_MS) {
          lastWritten.set(id, now);
          toUpdate.push(id);
        }
      }
      if (toUpdate.length > 0) {
        db.update(usersTable)
          .set({ lastActiveAt: new Date() })
          .where(inArray(usersTable.id, toUpdate as [number, ...number[]]))
          .catch(() => {});
      }
    }
  } catch {
    // never let activity tracking break a request
  }
  next();
}
