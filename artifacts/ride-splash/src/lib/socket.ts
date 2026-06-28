import { io } from "socket.io-client";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Single shared socket instance — connects to the same origin as the app
export const socket = io({
  path: `${BASE}/api/socket.io`,
  autoConnect: false,
  withCredentials: true,
  transports: ["websocket", "polling"],
});

/** Call once after login to identify the user and join relevant rooms */
export function identifySocket(userId: number, role: "pengguna" | "mitra", serviceType?: string) {
  if (!socket.connected) socket.connect();
  socket.emit("identify", { userId, role, serviceType });
}

/** Join the order room for real-time chat and order events */
export function joinOrderRoom(orderId: number) {
  socket.emit("join:order", orderId);
}

/** Leave the order room */
export function leaveOrderRoom(orderId: number) {
  socket.emit("leave:order", orderId);
}
