import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon paths
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const SERVICES = [
  { id: "ride_auto", label: "Ride Auto", emoji: "🔧", color: "#1a3a5c" },
  { id: "ride_towing", label: "Ride Towing", emoji: "🚛", color: "#1a4a7c" },
  { id: "ride_service", label: "Ride Service", emoji: "💡", color: "#2a3a7c" },
  { id: "ride_barber", label: "Ride Barber", emoji: "✂️", color: "#7c2a2a" },
  { id: "ride_wash", label: "Ride Wash", emoji: "🚿", color: "#1a5c7c" },
  { id: "ride_inspection", label: "Ride Inspection", emoji: "🔍", color: "#3a3a7c" },
  { id: "ride_repair", label: "Ride Repair & Build", emoji: "🏗️", color: "#5c3a1a" },
  { id: "ride_laundry", label: "Ride Laundry", emoji: "👕", color: "#1a5c3a" },
  { id: "ride_cleaning", label: "Ride Cleaning", emoji: "🧹", color: "#4a1a7c" },
];

interface OnlineMitra {
  id: number;
  name: string;
  lat: number;
  lng: number;
  serviceType: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`,
      { headers: { "Accept-Language": "id" } }
    );
    const data = await res.json();
    const addr = data.address;
    const parts = [
      addr.road || addr.pedestrian || addr.footway,
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village,
    ].filter(Boolean);
    return parts.join(", ") || data.display_name?.split(",").slice(0, 3).join(",") || "Lokasi saat ini";
  } catch {
    return "Lokasi saat ini";
  }
}

export default function DashboardPengguna() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<{ name: string; id: number } | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [address, setAddress] = useState<string>("Mendeteksi lokasi...");
  const [onlineMitra, setOnlineMitra] = useState<OnlineMitra[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickLat, setPickLat] = useState<number | null>(null);
  const [pickLng, setPickLng] = useState<number | null>(null);
  const [notifCount] = useState(0);
  const [activeOrder] = useState<null | { service: string; status: string }>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const mitraMarkersRef = useRef<L.CircleMarker[]>([]);
  const watchIdRef = useRef<number | null>(null);

  const pickerMapRef = useRef<HTMLDivElement>(null);
  const pickerLeafletRef = useRef<L.Map | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);

  // Load logged in user
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.id) setUser({ id: d.id, name: d.name });
        else navigate("/login");
      })
      .catch(() => navigate("/login"));
  }, [navigate]);

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS tidak tersedia di browser ini");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGpsError(null);
      },
      (err) => {
        if (err.code === 1) setGpsError("Izin GPS ditolak");
        else setGpsError("GPS tidak dapat diakses");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    watchIdRef.current = id;
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Reverse geocode when location changes
  useEffect(() => {
    if (userLat === null || userLng === null) return;
    reverseGeocode(userLat, userLng).then(setAddress);
  }, [userLat, userLng]);

  // Poll online mitra
  const fetchOnlineMitra = useCallback(() => {
    if (userLat === null || userLng === null) return;
    fetch(`/api/pengguna/mitra-online?lat=${userLat}&lng=${userLng}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.mitra)) setOnlineMitra(d.mitra); })
      .catch(() => {});
  }, [userLat, userLng]);

  useEffect(() => {
    fetchOnlineMitra();
    const interval = setInterval(fetchOnlineMitra, 15000);
    return () => clearInterval(interval);
  }, [fetchOnlineMitra]);

  // Init main map
  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    const defaultLat = userLat ?? -1.2654;
    const defaultLng = userLng ?? 116.8312;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    leafletMapRef.current = map;
  }, [userLat, userLng]);

  // Update user marker on map
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || userLat === null || userLng === null) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      userMarkerRef.current = L.circleMarker([userLat, userLng], {
        radius: 10, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3,
      }).addTo(map);
    }
    map.setView([userLat, userLng], 14);
  }, [userLat, userLng]);

  // Update mitra markers
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    mitraMarkersRef.current.forEach(m => m.remove());
    mitraMarkersRef.current = [];
    onlineMitra.forEach(mitra => {
      const marker = L.circleMarker([mitra.lat, mitra.lng], {
        radius: 8, color: "#16a34a", fillColor: "#22c55e", fillOpacity: 1, weight: 2,
      }).bindTooltip(`<b>${mitra.name}</b><br/>${mitra.serviceType}`, { permanent: false }).addTo(map);
      mitraMarkersRef.current.push(marker);
    });
  }, [onlineMitra]);

  // Init location picker map
  useEffect(() => {
    if (!showLocationPicker || !pickerMapRef.current) return;
    if (pickerLeafletRef.current) return;

    setTimeout(() => {
      if (!pickerMapRef.current) return;
      const lat = userLat ?? -1.2654;
      const lng = userLng ?? 116.8312;

      const map = L.map(pickerMapRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      setPickLat(lat); setPickLng(lng);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setPickLat(pos.lat); setPickLng(pos.lng);
      });

      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        setPickLat(e.latlng.lat); setPickLng(e.latlng.lng);
      });

      pickerLeafletRef.current = map;
      pickerMarkerRef.current = marker;
    }, 100);
  }, [showLocationPicker, userLat, userLng]);

  const confirmLocationPick = async () => {
    if (pickLat !== null && pickLng !== null) {
      setUserLat(pickLat); setUserLng(pickLng);
      const addr = await reverseGeocode(pickLat, pickLng);
      setAddress(addr);
    }
    setShowLocationPicker(false);
    if (pickerLeafletRef.current) { pickerLeafletRef.current.remove(); pickerLeafletRef.current = null; }
    pickerMarkerRef.current = null;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "#f0f4f8", fontFamily: "'Inter', sans-serif", overflow: "hidden" }}>

      {/* Header dark */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "48px 20px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 22 }}>👤</span>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 400 }}>Selamat datang 👋</div>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{user?.name ?? "..."}</div>
            </div>
          </div>
          <button style={{ position: "relative", width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            {notifCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, background: "#e74c3c", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 18, textAlign: "center" }}>{notifCount}</span>
            )}
          </button>
        </div>

        {/* Location bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: "#5fd3c4" }}>📍</span>
          <div style={{ flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {gpsError ? <span style={{ color: "#fca5a5" }}>{gpsError}</span> : address}
          </div>
          <button
            onClick={() => setShowLocationPicker(true)}
            style={{ background: "none", border: "none", color: "#5fd3c4", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            Ubah
          </button>
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 16px", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>🔍</span>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Cari layanan yang kamu butuhkan...</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>

        {/* White card - services */}
        <div style={{ background: "#fff", borderRadius: "0 0 24px 24px", padding: "20px 20px 24px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Layanan Kami</div>
            <button style={{ background: "none", border: "none", color: "#1a7a6a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Lihat Semua</button>
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {SERVICES.map(s => (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, width: 72, cursor: "pointer" }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {s.emoji}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1a2a3a", textAlign: "center", lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Active order card - only show when there's an active order */}
          {activeOrder && (
            <div style={{ borderRadius: 16, background: "#1a3a5c", padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: "#22c55e" }} />
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Order Sedang Berjalan</span>
                </div>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>›</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔧</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{activeOrder.service}</div>
                  <div style={{ color: "#5fd3c4", fontSize: 12, marginTop: 2 }}>● Sedang mencari mitra...</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ background: "#f59e0b", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>Mencari</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>Ketuk untuk lihat</div>
                </div>
              </div>
            </div>
          )}

          {/* Booking Advance */}
          <div style={{ borderRadius: 16, background: "#1a3a5c", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Booking Advance 📅</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 }}>Jadwalkan layanan untuk esok atau lusa</div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📆</div>
          </div>

          {/* Promo banner */}
          <div style={{ borderRadius: 16, background: "linear-gradient(135deg, #ea580c 0%, #f97316 100%)", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Diskon 10% Service Pertama! 🎁</div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4 }}>Kode: RIDE10 · Khusus pengguna baru</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 12px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>10%</div>
              <div style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>OFF</div>
            </div>
          </div>

          {/* Mitra Terdekat */}
          <div style={{ background: "#fff", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Mitra Terdekat</div>
                <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>Tap pin untuk lihat detail</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["🔧", "🚛", "✂️"].map((icon, i) => (
                  <div key={i} style={{ width: 36, height: 36, borderRadius: 10, background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}>
                    {icon}
                  </div>
                ))}
              </div>
            </div>

            <div ref={mapRef} style={{ width: "100%", height: 220, borderRadius: 16, overflow: "hidden", background: "#e8f0f8" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4a5568" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: "#60a5fa", border: "2px solid #3b82f6" }} />
                  Anda
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4a5568" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: "#22c55e", border: "2px solid #16a34a" }} />
                  Mitra
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a3a5c", borderRadius: 20, padding: "5px 12px" }}>
                <div style={{ width: 7, height: 7, borderRadius: 4, background: "#22c55e" }} />
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{onlineMitra.length} online</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8ecf0", display: "flex", zIndex: 1000 }}>
        {[
          { icon: "🏠", label: "Beranda", active: true, badge: 0 },
          { icon: "📋", label: "Pesanan", active: false, badge: 0 },
          { icon: "💬", label: "Chat", active: false, badge: 0 },
          { icon: "👤", label: "Akun", active: false, badge: 0 },
        ].map(item => (
          <button key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 6px", background: "none", border: "none", cursor: "pointer", position: "relative" }}>
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: item.active ? 700 : 500, color: item.active ? "#1a7a6a" : "#9aa5b4" }}>{item.label}</span>
            {item.badge > 0 && (
              <span style={{ position: "absolute", top: 6, right: "calc(50% - 20px)", background: "#e74c3c", color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>{item.badge}</span>
            )}
            {item.active && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 3, background: "#1a7a6a", borderRadius: 2 }} />}
          </button>
        ))}
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", marginTop: "auto", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #e8ecf0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Pilih Lokasi Kamu</div>
              <button onClick={() => { setShowLocationPicker(false); if (pickerLeafletRef.current) { pickerLeafletRef.current.remove(); pickerLeafletRef.current = null; } }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9aa5b4" }}>✕</button>
            </div>
            <div style={{ color: "#7a8a9a", fontSize: 13, padding: "8px 20px", background: "#f8f9fa" }}>
              📍 Seret pin atau tap peta untuk memilih lokasi
            </div>
            <div ref={pickerMapRef} style={{ flex: 1 }} />
            <div style={{ padding: "16px 20px", borderTop: "1px solid #e8ecf0" }}>
              <button
                onClick={confirmLocationPick}
                style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
              >
                Konfirmasi Lokasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
