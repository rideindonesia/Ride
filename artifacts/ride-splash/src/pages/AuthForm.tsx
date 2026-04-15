import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useRegister, useLogin } from "@workspace/api-client-react";

interface AuthFormPageProps {
  mode: "login" | "register";
}

export default function AuthForm({ mode }: AuthFormPageProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const role = (params.get("role") ?? "pengguna") as "pengguna" | "mitra";
  const isLogin = mode === "login";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const registerMutation = useRegister({
    mutation: {
      onSuccess: () => {
        setSuccess(true);
        setError(null);
        setTimeout(() => navigate("/login"), 1500);
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "Terjadi kesalahan");
      },
    },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: () => {
        setSuccess(true);
        setError(null);
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "Email atau password salah");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isLogin) {
      loginMutation.mutate({ data: { email, password, role } });
    } else {
      registerMutation.mutate({ data: { name, email, password, role } });
    }
  };

  const isPending = registerMutation.isPending || loginMutation.isPending;
  const roleLabel = role === "pengguna" ? "Pengguna" : "Mitra";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0d2137",
        overflow: "hidden",
      }}
    >
      {/* Top section */}
      <div
        style={{
          background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 50%, #1c4a5a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 56,
          paddingBottom: 40,
          flex: "0 0 auto",
        }}
      >
        <svg width="80" height="90" viewBox="0 0 120 134" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="60,4 112,33 112,101 60,130 8,101 8,33" stroke="rgba(100,200,200,0.7)" strokeWidth="3" fill="none" />
          <polygon points="60,18 98,40 98,94 60,116 22,94 22,40" stroke="rgba(80,180,180,0.5)" strokeWidth="2" fill="none" />
          <text x="60" y="78" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="38" fontWeight="700" fontFamily="'Inter', sans-serif">R</text>
        </svg>
        <div style={{ marginTop: 16, color: "rgba(100,200,200,0.9)", fontSize: 24, fontWeight: 700, letterSpacing: "0.22em", fontFamily: "'Inter', sans-serif" }}>RIDE</div>
        <div style={{ marginTop: 20, color: "rgba(255,255,255,0.75)", fontSize: 16, fontFamily: "'Inter', sans-serif" }}>
          {isLogin ? `Masuk sebagai ${roleLabel}` : `Daftar sebagai ${roleLabel}`}
        </div>
      </div>

      {/* Bottom card */}
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", padding: "32px 24px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        {success ? (
          <div style={{ textAlign: "center", color: "#1a8080", fontWeight: 700, fontSize: 16, marginTop: 32 }}>
            {isLogin ? "Berhasil masuk!" : "Pendaftaran berhasil! Mengarahkan ke halaman masuk..."}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!isLogin && (
              <div>
                <label style={{ fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 6 }}>Nama Lengkap</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Masukkan nama lengkap"
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff" }}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 6 }}>
                {isLogin ? "Email / No. HP" : "Email"}
              </label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder={isLogin ? "Email atau nomor HP terdaftar" : "Masukkan email"}
                style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Masukkan password"
                style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff" }}
              />
            </div>

            {error && (
              <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                marginTop: 8,
                padding: "16px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #1a3a5c 0%, #1a6060 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                fontFamily: "'Inter', sans-serif",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Memproses..." : isLogin ? "Masuk" : "Daftar"}
            </button>

            <div style={{ textAlign: "center", fontSize: 14, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>
              {isLogin ? (
                <>Belum punya akun?{" "}
                  <button type="button" onClick={() => navigate("/register")} style={{ background: "none", border: "none", color: "#1a8080", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    Daftar Sekarang
                  </button>
                </>
              ) : (
                <>Sudah punya akun?{" "}
                  <button type="button" onClick={() => navigate("/login")} style={{ background: "none", border: "none", color: "#1a8080", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    Masuk Sekarang
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
