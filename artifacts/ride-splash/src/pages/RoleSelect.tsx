import { useLocation } from "wouter";

interface RoleSelectPageProps {
  mode: "login" | "register";
}

export default function RoleSelect({ mode }: RoleSelectPageProps) {
  const [, navigate] = useLocation();
  const isLogin = mode === "login";

  const handleSelect = (role: "pengguna" | "mitra") => {
    navigate(`/${mode}/form?role=${role}`);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0d2137",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top gradient section */}
      <div
        style={{
          background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 50%, #1c4a5a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 56,
          paddingBottom: 40,
          flex: "0 0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Hexagon logo */}
        <svg width="80" height="90" viewBox="0 0 120 134" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon
            points="60,4 112,33 112,101 60,130 8,101 8,33"
            stroke="rgba(100,200,200,0.7)"
            strokeWidth="3"
            fill="none"
          />
          <polygon
            points="60,18 98,40 98,94 60,116 22,94 22,40"
            stroke="rgba(80,180,180,0.5)"
            strokeWidth="2"
            fill="none"
          />
          <text
            x="60"
            y="78"
            textAnchor="middle"
            fill="rgba(255,255,255,0.9)"
            fontSize="38"
            fontWeight="700"
            fontFamily="'Inter', sans-serif"
          >
            R
          </text>
        </svg>

        {/* RIDE title */}
        <div
          style={{
            marginTop: 16,
            color: "rgba(100,200,200,0.9)",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.22em",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          RIDE
        </div>

        {/* Subtitle */}
        <div
          style={{
            marginTop: 20,
            color: "rgba(255,255,255,0.75)",
            fontSize: 16,
            fontWeight: 400,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isLogin ? "Masuk sebagai siapa?" : "Daftar sebagai siapa?"}
        </div>
      </div>

      {/* Bottom white card */}
      <div
        style={{
          flex: 1,
          background: "#f0f4f8",
          borderRadius: "28px 28px 0 0",
          padding: "32px 20px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Pengguna card */}
        <button
          onClick={() => handleSelect("pengguna")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: "#ffffff",
            border: "none",
            borderRadius: 16,
            padding: "18px 20px",
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#e8f4f4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="7" r="4" fill="#5ba8a8" />
              <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="#5ba8a8" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>
              Pengguna
            </div>
            <div style={{ marginTop: 3, fontSize: 13, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>
              Cari &amp; pesan layanan jasa
            </div>
          </div>
          <div style={{ color: "#7a8a9a", fontSize: 18 }}>›</div>
        </button>

        {/* Mitra card */}
        <button
          onClick={() => handleSelect("mitra")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: "linear-gradient(135deg, #1a3a5c 0%, #1a6060 100%)",
            border: "none",
            borderRadius: 16,
            padding: "18px 20px",
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 28,
            }}
          >
            🧑‍🔧
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
              Mitra
            </div>
            <div style={{ marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "'Inter', sans-serif" }}>
              Terima order &amp; hasilkan uang
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 18 }}>›</div>
        </button>

        {/* Bottom link */}
        <div
          style={{
            marginTop: 8,
            textAlign: "center",
            fontSize: 14,
            color: "#7a8a9a",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isLogin ? (
            <>
              Belum punya akun?{" "}
              <button
                onClick={() => navigate("/register")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1a8080",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Daftar Sekarang
              </button>
            </>
          ) : (
            <>
              Sudah punya akun?{" "}
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1a8080",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Masuk Sekarang
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
