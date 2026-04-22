import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useLogin } from "@workspace/api-client-react";

interface AuthFormPageProps {
  mode: "login" | "register";
}

const DEMO_PENGGUNA = { hp: "81355446677", password: "demo1234" };

const DEMO_MITRA = [
  { name: "Budi Santoso", hp: "81234567890", service: "Bengkel Panggilan", emoji: "🔧", password: "mitra1234" },
  { name: "Rudi Hermawan", hp: "82198765432", service: "E-Towing", emoji: "🚛", password: "mitra1234" },
  { name: "Doni Prasetyo", hp: "83188889999", service: "Elektronik", emoji: "💡", password: "mitra1234" },
  { name: "Anto Wijaya", hp: "85211223344", service: "Pangkas Rambut", emoji: "✂️", password: "mitra1234" },
  { name: "Wahyu Sanjaya", hp: "87812345678", service: "Cuci Kendaraan", emoji: "🚿", password: "mitra1234" },
  { name: "Heru Gunawan", hp: "89934567890", service: "Inspeksi", emoji: "🔍", password: "mitra1234" },
];

export default function AuthForm({ mode }: AuthFormPageProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const role = (params.get("role") ?? "pengguna") as "pengguna" | "mitra";
  const isLogin = mode === "login";

  const [hp, setHp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mitraListOpen, setMitraListOpen] = useState(true);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setError(null);
        const userRole = (data as { user?: { role?: string } })?.user?.role ?? role;
        setTimeout(() => {
          if (userRole === "pengguna") navigate("/dashboard/pengguna");
          else navigate("/dashboard/mitra");
        }, 300);
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "Nomor HP atau password salah");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const fullPhone = "+62" + hp.replace(/^0+/, "");
    loginMutation.mutate({ data: { email: fullPhone, password, role } });
  };

  const fillDemo = (demoHp: string, demoPass: string) => {
    setHp(demoHp);
    setPassword(demoPass);
    setError(null);
  };

  const isPending = loginMutation.isPending;

  const subtitle = role === "pengguna"
    ? "Cari & pesan layanan jasa favoritmu"
    : "Terima order & hasilkan uang bersama RIDE";

  const title = role === "pengguna" ? "Masuk sebagai\nPengguna" : "Masuk sebagai\nMitra";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 45%, #1c4a5a 100%)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flex: "0 0 auto", padding: "52px 24px 32px", position: "relative" }}>
        <button
          onClick={() => navigate(isLogin ? "/login" : "/register")}
          style={{ position: "absolute", top: 52, left: 20, width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px", backdropFilter: "blur(4px)" }}
        >&lt;-</button>

        <div style={{ marginTop: 12, paddingLeft: 4 }}>
          <div style={{ color: "#fff", fontSize: 30, fontWeight: 800, fontFamily: "'Inter', sans-serif", lineHeight: 1.2, whiteSpace: "pre-line" }}>{title}</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "'Inter', sans-serif", marginTop: 8 }}>{subtitle}</div>
        </div>
      </div>

      {/* Form card */}
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", padding: "24px 20px 40px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {success ? (
          <div style={{ textAlign: "center", color: "#1a7a6a", fontWeight: 700, fontSize: 17, marginTop: 40, fontFamily: "'Inter', sans-serif" }}>
            ✓ Berhasil masuk!
          </div>
        ) : (
          <>
            {/* Demo box pengguna & mitra — disembunyikan dari tampilan user
            Akun demo tetap aktif, gunakan data berikut untuk backtest:
            Pengguna: +62 81355446677 / demo1234
            Mitra: lihat DEMO_MITRA di atas, semua password: mitra1234
            */}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Nomor HP */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 8 }}>Nomor HP</label>
                <div style={{ display: "flex", borderRadius: 12, border: "1.5px solid #d0dce8", background: "#fff", overflow: "hidden" }}>
                  <div style={{ padding: "14px 14px", background: "#f0f4f8", borderRight: "1.5px solid #d0dce8", fontSize: 15, fontWeight: 600, color: "#1a3a5c", fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>+62</div>
                  <input
                    type="tel"
                    value={hp}
                    onChange={e => setHp(e.target.value.replace(/\D/g, ""))}
                    required
                    placeholder="8xx xxxx xxxx"
                    style={{ flex: 1, padding: "14px 14px", border: "none", outline: "none", fontSize: 15, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", background: "transparent" }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 8 }}>Password</label>
                <div style={{ display: "flex", borderRadius: 12, border: "1.5px solid #d0dce8", background: "#fff", overflow: "hidden", alignItems: "center" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Masukkan password"
                    style={{ flex: 1, padding: "14px 14px", border: "none", outline: "none", fontSize: 15, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", background: "transparent" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    style={{ padding: "0 14px", background: "none", border: "none", cursor: "pointer", color: "#7a8a9a", fontSize: 18, display: "flex", alignItems: "center" }}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>{error}</div>
              )}

              <button
                type="submit"
                disabled={isPending}
                style={{ marginTop: 4, padding: "16px", borderRadius: 14, border: "none", background: isPending ? "#b0c4d0" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: isPending ? "not-allowed" : "pointer" }}
              >
                {isPending ? "Memverifikasi..." : "Masuk"}
              </button>

              <div style={{ textAlign: "center", fontSize: 14, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>
                Belum punya akun?{" "}
                <button type="button" onClick={() => navigate("/register")} style={{ background: "none", border: "none", color: "#1a7a6a", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                  Daftar Sekarang
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
