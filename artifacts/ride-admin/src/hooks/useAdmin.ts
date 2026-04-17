import { useState, useEffect, createContext, useContext } from "react";
import { api } from "@/lib/api";

interface AdminUser { id: number; name: string; email: string }

interface AdminCtx {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AdminContext = createContext<AdminCtx>({
  admin: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}

export function useAdminState(): AdminCtx {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<AdminUser>("/admin/me")
      .then(u => setAdmin(u))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ ok: boolean; admin: AdminUser }>("/admin/login", { email, password });
    setAdmin(res.admin);
  };

  const logout = async () => {
    await api.post("/admin/logout", {});
    setAdmin(null);
  };

  return { admin, loading, login, logout };
}
