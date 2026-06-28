const API = "/api";
const ADMIN_TOKEN_KEY = "ride_admin_token";

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}
export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}
export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Admin-Token"] = token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.includes("/login")) {
    clearAdminToken();
    throw new Error("Sesi berakhir. Silakan login ulang.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Terjadi kesalahan");
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => req<T>("GET", path),
  post: <T>(path: string, body: unknown) => req<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => req<T>("PATCH", path, body),
  del: <T>(path: string) => req<T>("DELETE", path),
};

export function rupiahFormat(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDatetime(d: string | Date): string {
  return new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const SERVICE_LABELS: Record<string, string> = {
  bengkel: "Bengkel",
  barber: "Barber",
  cuci: "Cuci",
  elektronik: "Elektronik",
  inspeksi: "Inspeksi",
  towing: "Towing",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  accepted: "Diterima",
  in_progress: "Dalam Proses",
  done: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
};

export const MITRA_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-gray-100 text-gray-800",
};

export const SERVICE_COLORS = ["#1a7a6a", "#1a3a5c", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
