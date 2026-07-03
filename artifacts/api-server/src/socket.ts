import { Server, type Socket } from "socket.io";
import type http from "http";
import { db, ordersTable, mitraLocationsTable, usersTable, mitraApplicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cookieParserMw,
  sessionMw,
  collectVerifiedIds,
  hasMitraIdentity,
  isAdminReq,
} from "./lib/session";

export let io: Server;

// Ojol umbrella: mitra motor menerima siaran semua layanan grup (antar/kirim/belanja/makan).
const OJOL_ORDER_TYPES = ["goride", "gosend", "goshop", "gofood"];
const OJOL_CAPABLE = new Set(["ojol", "goride", "gosend", "goshop", "gofood"]);
function normSvc(s: string): string { return s.toLowerCase().replace(/[\s_-]+/g, ""); }

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });

  // Run the SAME cookie + session middleware as the HTTP app on every
  // handshake, so socket.request carries authenticated session + signed cookies.
  io.engine.use(cookieParserMw);
  io.engine.use(sessionMw);

  io.on("connection", (socket: Socket) => {
    const req = socket.request as any;
    const verified = collectVerifiedIds(req); // verified user IDs from session/cookies
    const admin = isAdminReq(req);
    const mitra = hasMitraIdentity(req);

    socket.data.verified = verified;
    socket.data.admin = admin;

    // Auto-join each verified user's room — derived from the server-trusted
    // session, NOT from any client-supplied userId.
    for (const id of verified) socket.join(`user:${id}`);
    if (admin) socket.join("room:admin");

    // identify: (re)join the rooms this socket is entitled to. The client may
    // pass a serviceType, but we DELIBERATELY IGNORE it — the service room is
    // resolved from the DB using the server-trusted mitra identity, so a mitra
    // can never subscribe to another service's order broadcasts.
    socket.on("identify", async () => {
      for (const id of verified) socket.join(`user:${id}`);
      if (admin) socket.join("room:admin");
      if (!mitra) return;
      try {
        for (const id of verified) {
          // Resolve this mitra's real service type: mitra_locations first,
          // then fall back to their approved mitra_applications row.
          const [loc] = await db
            .select({ serviceType: mitraLocationsTable.serviceType })
            .from(mitraLocationsTable)
            .where(eq(mitraLocationsTable.userId, id))
            .limit(1);
          let svc = loc?.serviceType ?? null;
          if (!svc) {
            const [u] = await db
              .select({ email: usersTable.email })
              .from(usersTable)
              .where(eq(usersTable.id, id))
              .limit(1);
            if (u?.email) {
              const [app] = await db
                .select({ serviceType: mitraApplicationsTable.serviceType })
                .from(mitraApplicationsTable)
                .where(eq(mitraApplicationsTable.email, u.email))
                .limit(1);
              svc = app?.serviceType ?? null;
            }
          }
          if (svc) {
            socket.join(`service:${svc}`);
            // Ojol umbrella mitra ikut room semua layanan grup agar terima order:new + cancel.
            if (OJOL_CAPABLE.has(normSvc(svc))) {
              for (const t of OJOL_ORDER_TYPES) socket.join(`service:${t}`);
            }
          }
        }
      } catch {
        /* ignore — do not join any service room on lookup failure */
      }
    });

    // join:order — only if this socket is a party to the order (or admin).
    socket.on("join:order", async (orderId: number) => {
      const id = Number(orderId);
      if (!id || Number.isNaN(id)) return;
      if (admin) {
        socket.join(`order:${id}`);
        return;
      }
      try {
        const [order] = await db
          .select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
          .from(ordersTable)
          .where(eq(ordersTable.id, id))
          .limit(1);
        if (order && (verified.has(order.penggunaId) || verified.has(order.mitraId ?? -1))) {
          socket.join(`order:${id}`);
        }
      } catch {
        /* ignore — do not join on lookup failure */
      }
    });

    socket.on("leave:order", (orderId: number) => {
      socket.leave(`order:${orderId}`);
    });
  });

  return io;
}
