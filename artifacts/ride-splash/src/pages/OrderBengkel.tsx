import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

const STEPS = [
  { label: "Kendaraan", emoji: "🚗" },
  { label: "Lokasi", emoji: "📍" },
  { label: "Mitra", emoji: "🔧" },
  { label: "Tracking", emoji: "📡" },
  { label: "Bayar", emoji: "💳" },
];

const KATEGORI_MOBIL = ["Mogok Total", "Ban Bocor", "Overheat", "Aki Soak", "Lampu Mati", "Lainnya"];
const KATEGORI_MOTOR = ["Mogok Total", "Rantai Putus", "Ban Bocor", "Overheat", "Aki Soak", "Lainnya"];

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`,
      { headers: { "Accept-Language": "id" } }
    );
    const data = await res.json();
    const addr = data.address;
    const parts = [addr.road || addr.pedestrian, addr.suburb || addr.neighbourhood, addr.city || addr.town].filter(Boolean);
    return parts.join(", ") || data.display_name?.split(",").slice(0, 3).join(",") || "";
  } catch { return ""; }
}

function StepProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {STEPS.map((s, i) => {
        const isActive = i + 1 === step;
        const isDone = i + 1 < step;
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: isActive ? "#fff" : isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)",
                border: isActive ? "none" : "2px solid rgba(255,255,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: isActive ? 18 : 14,
              }}>
                {isDone ? <span style={{ color: "#f5a623", fontSize: 16, fontWeight: 900 }}>✓</span> : <span>{s.emoji}</span>}
              </div>
              <div style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap" }}>{s.label}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: isDone ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)", margin: "0 4px", marginBottom: 16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrderBengkel() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Step 1
  const [jenisKendaraan, setJenisKendaraan] = useState<"mobil" | "motor">("mobil");
  const [merekModel, setMerekModel] = useState("");
  const [tahun, setTahun] = useState(new Date().getFullYear().toString());
  const [kategori, setKategori] = useState<string[]>(["Mogok Total"]);
  const [deskripsi, setDeskripsi] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [autoAddress, setAutoAddress] = useState("");
  const [detailAlamat, setDetailAlamat] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null);

  const categories = jenisKendaraan === "mobil" ? KATEGORI_MOBIL : KATEGORI_MOTOR;
  const canNext1 = merekModel.trim() && tahun && kategori.length > 0;

  const handleJenisChange = (jenis: "mobil" | "motor") => {
    setJenisKendaraan(jenis);
    setKategori([]);
  };

  const toggleKategori = (k: string) => {
    setKategori(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Init map on step 2
  useEffect(() => {
    if (step !== 2 || !mapRef.current) return;
    if (leafletMapRef.current) return;

    const lat = userLat ?? -1.2654;
    const lng = userLng ?? 116.8312;

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

    // User GPS dot
    if (userLat !== null && userLng !== null) {
      gpsMarkerRef.current = L.circleMarker([userLat, userLng], {
        radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3,
      }).addTo(map);
    }

    setPinLat(lat);
    setPinLng(lng);

    // Reverse geocode initial center
    setIsGeocoding(true);
    reverseGeocode(lat, lng).then(addr => {
      setAutoAddress(addr);
      setIsGeocoding(false);
    });

    // On map move end — reverse geocode center
    map.on("moveend", () => {
      const center = map.getCenter();
      setPinLat(center.lat);
      setPinLng(center.lng);
      setIsGeocoding(true);
      reverseGeocode(center.lat, center.lng).then(addr => {
        setAutoAddress(addr);
        setIsGeocoding(false);
      });
    });

    leafletMapRef.current = map;
  }, [step, userLat, userLng]);

  // Update GPS marker as user moves
  useEffect(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    if (gpsMarkerRef.current) {
      gpsMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      gpsMarkerRef.current = L.circleMarker([userLat, userLng], {
        radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3,
      }).addTo(leafletMapRef.current);
    }
  }, [userLat, userLng]);

  // Cleanup map when leaving step 2
  useEffect(() => {
    return () => {
      if (step === 2 && leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        gpsMarkerRef.current = null;
      }
    };
  }, [step]);

  const snapToGps = useCallback(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    leafletMapRef.current.setView([userLat, userLng], 16, { animate: true });
  }, [userLat, userLng]);

  const goToStep2 = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      gpsMarkerRef.current = null;
    }
    setStep(2);
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => step === 1 ? navigate("/dashboard/pengguna") : setStep(1)}
            style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}
          >&lt;-</button>
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>🔧 Bengkel Panggilan</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Pesan layanan sekarang</div>
          </div>
        </div>
        <StepProgress step={step} />
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "24px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20 }}>🚗 Data Kendaraan</div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Jenis Kendaraan</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {([["mobil", "🚗", "Mobil"], ["motor", "🏍️", "Motor"]] as const).map(([val, icon, lbl]) => (
                    <button key={val} onClick={() => handleJenisChange(val)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: jenisKendaraan === val ? "2px solid #1a7a6a" : "2px solid #e0e8f0", background: jenisKendaraan === val ? "rgba(26,122,106,0.08)" : "#f8fafc", color: jenisKendaraan === val ? "#1a7a6a" : "#7a8a9a", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      {icon} {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Merek & Model</label>
                <input type="text" value={merekModel} onChange={e => setMerekModel(e.target.value)} placeholder={jenisKendaraan === "mobil" ? "Contoh: Toyota Avanza" : "Contoh: Honda Beat"} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none" }} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Tahun</label>
                <input type="number" value={tahun} onChange={e => setTahun(e.target.value)} min={1990} max={new Date().getFullYear()} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none" }} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Kategori Kerusakan</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {categories.map(k => (
                    <button key={k} onClick={() => toggleKategori(k)} style={{ padding: "8px 16px", borderRadius: 20, border: kategori.includes(k) ? "2px solid #ea580c" : "1.5px solid #d0dce8", background: kategori.includes(k) ? "rgba(234,88,12,0.08)" : "#f8fafc", color: kategori.includes(k) ? "#ea580c" : "#4a5568", fontWeight: kategori.includes(k) ? 700 : 500, fontSize: 13, cursor: "pointer" }}>{k}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Deskripsi Kerusakan</label>
                <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} placeholder="Jelaskan detail kerusakan kendaraan Anda..." rows={4} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Foto/Video <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" capture="environment" onChange={e => { if (e.target.files?.[0]) setFoto(e.target.files[0]); }} style={{ display: "none" }} />
                <button onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "28px 16px", borderRadius: 14, border: "2px dashed #c0d0e0", background: "#f8fafc", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {foto ? (<><span style={{ fontSize: 28 }}>✅</span><span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>{foto.name}</span><span style={{ fontSize: 11, color: "#9aa5b4" }}>Tap untuk ganti</span></>) : (<><span style={{ fontSize: 28 }}>📸</span><span style={{ fontSize: 13, color: "#7a8a9a" }}>Tap untuk upload</span></>)}
                </button>
              </div>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
            <button disabled={!canNext1} onClick={goToStep2} style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: canNext1 ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext1 ? "pointer" : "not-allowed" }}>
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 16 }}>📍 Pilih Lokasi</div>

              {/* Map with center pin */}
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 20, height: 260 }}>
                <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

                {/* Fixed center pin */}
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", marginBottom: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2a3a", whiteSpace: "nowrap" }}>
                      {isGeocoding ? "Memuat..." : "Posisi Anda"}
                    </div>
                    {!isGeocoding && <div style={{ fontSize: 10, color: "#7a8a9a", whiteSpace: "nowrap" }}>Geser untuk sesuaikan</div>}
                  </div>
                  <span style={{ fontSize: 32, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>📍</span>
                </div>

                {/* GPS button bottom-right */}
                <button
                  onClick={snapToGps}
                  style={{ position: "absolute", bottom: 12, right: 12, zIndex: 1000, width: 42, height: 42, borderRadius: 12, background: "#fff", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}
                >
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#1a3a5c", letterSpacing: 0.5 }}>GPS</span>
                </button>
              </div>

              {/* Auto-detected address */}
              {autoAddress && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: "rgba(26,122,106,0.07)", borderRadius: 12, marginBottom: 16, border: "1px solid rgba(26,122,106,0.2)" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span>
                  <span style={{ fontSize: 13, color: "#1a3a5c", lineHeight: 1.4 }}>{autoAddress}</span>
                </div>
              )}

              {/* Detail Alamat */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Detail Alamat</label>
                <textarea
                  value={detailAlamat}
                  onChange={e => setDetailAlamat(e.target.value)}
                  placeholder="Depan Indomaret, dekat lampu merah..."
                  rows={3}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }}
                />
              </div>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100, display: "flex", gap: 12 }}>
            <button
              onClick={() => setStep(1)}
              style={{ flex: 1, padding: "17px", borderRadius: 16, border: "1.5px solid #1a3a5c", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              ← Kembali
            </button>
            <button
              style={{ flex: 2, padding: "17px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              Lanjut →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
