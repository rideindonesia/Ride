import { Server, type Socket } from "socket.io";
import type http from "http";

export let io: Server;

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    // Client identifies itself with userId + role so we can put them in a room
    socket.on("identify", ({ userId, role, serviceType }: { userId: number; role: string; serviceType?: string }) => {
      socket.join(`user:${userId}`);
      // Mitra joins a service-type room to receive order broadcasts
      if (role === "mitra" && serviceType) {
        socket.join(`service:${serviceType}`);
      }
      // Admin joins a special room to receive all order events
      if (role === "admin") {
        socket.join("room:admin");
      }
    });

    // Client joins an order room (for chat + order updates)
    socket.on("join:order", (orderId: number) => {
      socket.join(`order:${orderId}`);
    });

    socket.on("leave:order", (orderId: number) => {
      socket.leave(`order:${orderId}`);
    });
  });

  return io;
}
