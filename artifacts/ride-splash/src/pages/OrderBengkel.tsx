import { useState, useRef } from "react";
import { useLocation } from "wouter";

const STEPS = [
  { label: "Kendaraan", emoji: "🚗" },
  { label: "Lokasi", emoji: "📍" },
  { label: "Mitra", emoji: "🔧" },
  { label: "Tracking", emoji: "📡" },
  { label: "Bayar", emoji: "💳" },
];

const KATEGORI_MOBIL = [
  "Mogok Total", "Ban Bocor", "Overheat", "Aki Soak", "Lampu Mati", "Lainnya",
];

const KATEGORI_MOTOR = [
  "Mogok Total", "Rantai Putus", "Ban Bocor", "Overheat", "Aki Soak", "Lainnya",
];

export default function OrderBengkel() {
  const [, navigate] = useLocation();
  const [step] = useState(1);

  // Step 1 form state
  const [jenisKendaraan, setJenisKendaraan] = useState<"mobil" | "motor">("mobil");
  const [merekModel, setMerekModel] = useState("");
  const [tahun, setTahun] = useState(new Date().getFullYear().toString());
  const [kategori, setKategori] = useState<string[]>(["Mogok Total"]);
  const [deskripsi, setDeskripsi] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = jenisKendaraan === "mobil" ? KATEGORI_MOBIL : KATEGORI_MOTOR;

  // Reset kategori when vehicle type changes
  const handleJenisChange = (jenis: "mobil" | "motor") => {
    setJenisKendaraan(jenis);
    setKategori([]);
  };

  const toggleKategori = (k: string) => {
    setKategori(prev =>
      prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    );
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFoto(e.target.files[0]);
  };

  const canNext = merekModel.trim() && tahun && kategori.length > 0;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => navigate("/dashboard/pengguna")}
            style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}
          >&lt;-</button>
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>🔧 Bengkel Panggilan</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Pesan layanan sekarang</div>
          </div>
        </div>

        {/* Progress steps */}
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 0 }}>
          {STEPS.map((s, i) => {
            const isActive = i + 1 === step;
            const isDone = i + 1 < step;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: isActive ? "#fff" : isDone ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)",
                    border: isActive ? "none" : "2px solid rgba(255,255,255,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isActive ? 18 : 14,
                  }}>
                    {isDone ? <span style={{ color: "#1a7a6a", fontSize: 16, fontWeight: 700 }}>✓</span> : <span>{s.emoji}</span>}
                  </div>
                  <div style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap" }}>{s.label}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isDone ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", margin: "0 4px", marginBottom: 16 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 100px" }}>
        <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "24px 20px", marginTop: 0 }}>

          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            🚗 Data Kendaraan
          </div>

          {/* Jenis Kendaraan */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Jenis Kendaraan</label>
            <div style={{ display: "flex", gap: 12 }}>
              {([["mobil", "🚗", "Mobil"], ["motor", "🏍️", "Motor"]] as const).map(([val, icon, lbl]) => (
                <button
                  key={val}
                  onClick={() => handleJenisChange(val)}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 14,
                    border: jenisKendaraan === val ? "2px solid #1a7a6a" : "2px solid #e0e8f0",
                    background: jenisKendaraan === val ? "rgba(26,122,106,0.08)" : "#f8fafc",
                    color: jenisKendaraan === val ? "#1a7a6a" : "#7a8a9a",
                    fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {icon} {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Merek & Model */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Merek & Model</label>
            <input
              type="text"
              value={merekModel}
              onChange={e => setMerekModel(e.target.value)}
              placeholder={jenisKendaraan === "mobil" ? "Contoh: Toyota Avanza" : "Contoh: Honda Beat"}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none" }}
            />
          </div>

          {/* Tahun */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Tahun</label>
            <input
              type="number"
              value={tahun}
              onChange={e => setTahun(e.target.value)}
              min={1990}
              max={new Date().getFullYear()}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none" }}
            />
          </div>

          {/* Kategori Kerusakan */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Kategori Kerusakan</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {categories.map(k => (
                <button
                  key={k}
                  onClick={() => toggleKategori(k)}
                  style={{
                    padding: "8px 16px", borderRadius: 20,
                    border: kategori.includes(k) ? "2px solid #ea580c" : "1.5px solid #d0dce8",
                    background: kategori.includes(k) ? "rgba(234,88,12,0.08)" : "#f8fafc",
                    color: kategori.includes(k) ? "#ea580c" : "#4a5568",
                    fontWeight: kategori.includes(k) ? 700 : 500,
                    fontSize: 13, cursor: "pointer",
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Deskripsi */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Deskripsi Kerusakan</label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              placeholder="Jelaskan detail kerusakan kendaraan Anda..."
              rows={4}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Foto/Video */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>
              Foto/Video <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span>
            </label>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" capture="environment" onChange={handleFotoChange} style={{ display: "none" }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: "100%", padding: "28px 16px", borderRadius: 14, border: "2px dashed #c0d0e0", background: "#f8fafc", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
            >
              {foto ? (
                <>
                  <span style={{ fontSize: 28 }}>✅</span>
                  <span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>{foto.name}</span>
                  <span style={{ fontSize: 11, color: "#9aa5b4" }}>Tap untuk ganti</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 28 }}>📸</span>
                  <span style={{ fontSize: 13, color: "#7a8a9a" }}>Tap untuk upload</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Fixed bottom button */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
        <button
          disabled={!canNext}
          style={{
            width: "100%", padding: "17px", borderRadius: 16, border: "none",
            background: canNext ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#c0d0dc",
            color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext ? "pointer" : "not-allowed",
          }}
        >
          Lanjut →
        </button>
      </div>
    </div>
  );
}
