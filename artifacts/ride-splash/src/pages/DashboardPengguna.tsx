import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const SERVICE_ROUTES: Record<string, string> = {
  ride_auto: "/order/bengkel",
  ride_service: "/order/elektronik",
  ride_wash: "/order/cuci",
  ride_barber: "/order/barber",
  ride_inspection: "/order/inspeksi",
  ride_towing: "/order/towing",
};

// Fix leaflet default icon paths
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const ACTIVE_SERVICES = [
  { id: "ride_auto", label: "Ride Auto", emoji: "🔧", color: "#1a3a5c" },
  { id: "ride_towing", label: "Ride Towing", emoji: "🚛", color: "#1a4a7c" },
  { id: "ride_service", label: "Ride Service", emoji: "💡", color: "#2a3a7c" },
  { id: "ride_barber", label: "Ride Barber", emoji: "✂️", color: "#7c2a2a" },
  { id: "ride_wash", label: "Ride Wash", emoji: "🚿", color: "#1a5c7c" },
  { id: "ride_inspection", label: "Ride Inspection", emoji: "🔍", color: "#2a5c2a" },
];

const COMING_SOON_SERVICES = [
  { id: "ride_laundry", label: "Ride Laundry", emoji: "👕", color: "#8a9aaa" },
  { id: "ride_cleaning", label: "Ride Cleaning", emoji: "🧹", color: "#8a9aaa" },
  { id: "ride_repair", label: "Ride Repair & Build", emoji: "🏗️", color: "#8a9aaa" },
];

const SERVICES = [...ACTIVE_SERVICES, ...COMING_SOON_SERVICES];

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

type OrderHistory = {
  id: number; orderNo: string; serviceType: string; vehicleModel: string; vehicleYear: string;
  damageCategories: string[] | null; pickupAddress: string | null;
  totalAmount: number; paymentData: { biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string } | null;
  createdAt: string;
};

const SVC_CFG: Record<string, { emoji: string; label: string }> = {
  bengkel:   { emoji: "🔧", label: "Ride Auto" },
  elektronik:{ emoji: "💡", label: "Ride Service" },
  cuci:      { emoji: "🚿", label: "Ride Wash" },
  barber:    { emoji: "✂️", label: "Ride Barber" },
  inspeksi:  { emoji: "🔍", label: "Ride Inspection" },
  towing:    { emoji: "🚛", label: "Ride Towing" },
};
const getSvc = (t: string) => SVC_CFG[t] ?? { emoji: "🔧", label: t };
const fmtRp = (n: number | null | undefined) => "Rp " + (n ?? 0).toLocaleString("id-ID");
const fmtDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
};

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
  const [activeOrder, setActiveOrder] = useState<null | {
    id: number; orderNo: string; status: string; trackingPhase: string;
    vehicleModel: string; damageCategories: string[]; mitraName: string | null;
  }>(null);
  const [showAllServices, setShowAllServices] = useState(false);

  // Tab navigation
  type TabId = "beranda" | "pesanan" | "chat" | "akun";
  const [activeTab, setActiveTab] = useState<TabId>("beranda");
  const [pesananSubTab, setPesananSubTab] = useState<"aktif" | "riwayat">("aktif");
  const [chatSubTab, setChatSubTab] = useState<"aktif" | "riwayat">("aktif");

  // Order history
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  // Chat
  type ChatMsg = { id: number; senderRole: string; message: string; createdAt: string };
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatHistoryOrderId, setChatHistoryOrderId] = useState<number | null>(null);
  const [chatHistoryMsgs, setChatHistoryMsgs] = useState<ChatMsg[]>([]);
  const [loadingChatHistory, setLoadingChatHistory] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  // Poll active order every 5s
  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json())
        .then(d => setActiveOrder(d.order ?? null))
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 5000);
    return () => clearInterval(t);
  }, []);

  // Fetch order history
  useEffect(() => {
    fetch("/api/pengguna/order-history", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); })
      .catch(() => {});
  }, []);

  // Poll chat msgs for active order every 3s
  useEffect(() => {
    if (!activeOrder) { setChatMsgs([]); return; }
    const poll = () =>
      fetch(`/api/chat/${activeOrder.id}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d.messages)) {
            setChatMsgs(d.messages);
            setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          }
        }).catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [activeOrder?.id]);

  const sendChat = async () => {
    if (!chatInput.trim() || !activeOrder || chatSending) return;
    setChatSending(true);
    const msg = chatInput.trim();
    setChatInput("");
    await fetch(`/api/chat/${activeOrder.id}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, senderRole: "pengguna" }),
    }).catch(() => {});
    setChatSending(false);
  };

  const fetchChatHistory = (orderId: number) => {
    if (chatHistoryOrderId === orderId) { setChatHistoryOrderId(null); return; }
    setChatHistoryOrderId(orderId);
    setLoadingChatHistory(true);
    fetch(`/api/chat/${orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.messages)) setChatHistoryMsgs(d.messages); })
      .catch(() => {})
      .finally(() => setLoadingChatHistory(false));
  };

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
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", fontFamily: "'Inter', sans-serif", overflow: "hidden" }}>

      {/* Header dark */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "48px 14px 16px", flexShrink: 0 }}>
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
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 16px", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>🔍</span>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Cari layanan yang kamu butuhkan...</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>

        {/* ══ BERANDA TAB ══ */}
        {activeTab === "beranda" && <>

        {/* White card - services */}
        <div style={{ background: "#fff", borderRadius: "0 0 24px 24px", padding: "18px 14px 22px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Layanan Kami</div>
            <button onClick={() => setShowAllServices(true)} style={{ background: "none", border: "none", color: "#1a7a6a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Lihat Semua</button>
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {SERVICES.map(s => {
              const route = SERVICE_ROUTES[s.id];
              const isComingSoon = COMING_SOON_SERVICES.some(cs => cs.id === s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => !isComingSoon && route && navigate(route)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, width: 72, cursor: isComingSoon ? "default" : route ? "pointer" : "default", opacity: isComingSoon ? 0.5 : 1, position: "relative" }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                    {s.emoji}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a2a3a", textAlign: "center", lineHeight: 1.3 }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Active order card */}
          {activeOrder && (
            <div
              onClick={() => navigate(`/order/bengkel?resume=${activeOrder.id}`)}
              style={{ borderRadius: 16, background: "linear-gradient(135deg, #0d2137 0%, #1a3a5c 100%)", padding: 16, cursor: "pointer", border: "1.5px solid rgba(26,122,106,0.4)", boxShadow: "0 4px 16px rgba(26,58,92,0.25)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Order Sedang Berjalan</span>
                </div>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>›</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🔧</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{activeOrder.vehicleModel || "Bengkel Panggilan"}</div>
                  <div style={{ color: "#5fd3c4", fontSize: 12, marginTop: 2 }}>
                    {activeOrder.trackingPhase === "selesai"
                      ? "💳 Menunggu pembayaran"
                      : activeOrder.trackingPhase === "pengerjaan"
                      ? "🔧 Sedang dikerjakan"
                      : activeOrder.trackingPhase === "tiba"
                      ? "📍 Mitra sudah tiba"
                      : activeOrder.mitraName
                      ? `🏍️ ${activeOrder.mitraName} menuju lokasi`
                      : "🔍 Mencari mitra terdekat..."}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>#{activeOrder.orderNo}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{
                    background: activeOrder.trackingPhase === "selesai" ? "#ea580c"
                      : activeOrder.trackingPhase === "pengerjaan" ? "#7c3aed"
                      : activeOrder.trackingPhase === "tiba" ? "#0284c7"
                      : "#1a7a6a",
                    color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700
                  }}>
                    {activeOrder.trackingPhase === "selesai" ? "💳 Bayar" 
                      : activeOrder.trackingPhase === "pengerjaan" ? "🔧 Pengerjaan"
                      : activeOrder.trackingPhase === "tiba" ? "📍 Tiba"
                      : "✅ Diterima"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 }}>Ketuk untuk lihat</div>
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

        </>} {/* end beranda */}

        {/* ══ PESANAN TAB ══ */}
        {activeTab === "pesanan" && <div style={{ padding: "16px 10px" }}>
          {/* Sub-tab pills */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {([
              { id: "aktif" as const, label: "Order Aktif", count: activeOrder ? 1 : 0 },
              { id: "riwayat" as const, label: "Riwayat Order", count: orderHistory.length },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setPesananSubTab(tab.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 24, border: pesananSubTab === tab.id ? "none" : "1.5px solid #d0dce8", background: pesananSubTab === tab.id ? "#1a3a5c" : "#fff", color: pesananSubTab === tab.id ? "#fff" : "#7a8a9a", fontWeight: pesananSubTab === tab.id ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                {tab.label}
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: pesananSubTab === tab.id ? "rgba(255,255,255,0.25)" : "#e8f0f8", color: pesananSubTab === tab.id ? "#fff" : "#4a5a6a", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Order Aktif */}
          {pesananSubTab === "aktif" && (
            activeOrder ? (
              <div onClick={() => navigate(`/order/bengkel?resume=${activeOrder.id}`)}
                style={{ borderRadius: 18, background: "linear-gradient(135deg, #0d2137 0%, #1a3a5c 100%)", padding: 16, cursor: "pointer", border: "1.5px solid rgba(26,122,106,0.4)", boxShadow: "0 4px 16px rgba(26,58,92,0.25)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                    <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Order Sedang Berjalan</span>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>›</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🔧</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{activeOrder.vehicleModel || "Bengkel Panggilan"}</div>
                    <div style={{ color: "#5fd3c4", fontSize: 12, marginTop: 2 }}>
                      {activeOrder.trackingPhase === "selesai" ? "💳 Menunggu pembayaran"
                        : activeOrder.trackingPhase === "pengerjaan" ? "🔧 Sedang dikerjakan"
                        : activeOrder.trackingPhase === "tiba" ? "📍 Mitra sudah tiba"
                        : activeOrder.mitraName ? `🏍️ ${activeOrder.mitraName} menuju lokasi`
                        : "🔍 Mencari mitra terdekat..."}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>#{activeOrder.orderNo}</div>
                  </div>
                  <div style={{ background: activeOrder.trackingPhase === "selesai" ? "#ea580c" : activeOrder.trackingPhase === "pengerjaan" ? "#7c3aed" : activeOrder.trackingPhase === "tiba" ? "#0284c7" : "#1a7a6a", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {activeOrder.trackingPhase === "selesai" ? "💳 Bayar" : activeOrder.trackingPhase === "pengerjaan" ? "🔧 Pengerjaan" : activeOrder.trackingPhase === "tiba" ? "📍 Tiba" : "✅ Diterima"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "56px 24px" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada order aktif</div>
                <div style={{ fontSize: 13, color: "#9aa5b4" }}>Pesan layanan dari Beranda untuk memulai</div>
              </div>
            )
          )}

          {/* Riwayat Order */}
          {pesananSubTab === "riwayat" && (
            orderHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 24px" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🗓️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada riwayat</div>
                <div style={{ fontSize: 13, color: "#9aa5b4" }}>Order yang sudah selesai akan tampil di sini</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {orderHistory.map(o => {
                  const svc = getSvc(o.serviceType);
                  const isOpen = expandedHistoryId === o.id;
                  const pd = o.paymentData;
                  const keluhan = Array.isArray(o.damageCategories) ? o.damageCategories.join(", ") : "-";
                  return (
                    <div key={o.id} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
                      <button onClick={() => setExpandedHistoryId(isOpen ? null : o.id)} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 46, height: 46, borderRadius: 16, background: "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{svc.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>{svc.label}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#1a7a6a", background: "rgba(26,122,106,0.1)", borderRadius: 20, padding: "2px 8px" }}>✓ Selesai</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#7a8a9a" }}>{o.vehicleModel} {o.vehicleYear}</div>
                            <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>🕐 {fmtDate(o.createdAt)}</div>
                          </div>
                          <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#1a3a5c" }}>{fmtRp(o.totalAmount)}</div>
                            <div style={{ fontSize: 18, color: "#b0bec5", marginTop: 4 }}>{isOpen ? "▲" : "▼"}</div>
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: "1px solid #f0f4f8" }}>
                          <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 10 }}>DETAIL ORDER</div>
                            {[{ label: "No. Order", val: o.orderNo }, { label: "Layanan", val: svc.label }].map(row => (
                              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <span style={{ fontSize: 13, color: "#7a8a9a" }}>{row.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{row.val}</span>
                              </div>
                            ))}
                            {keluhan !== "-" && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 13, color: "#7a8a9a" }}>Keluhan: </span><span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{keluhan}</span></div>}
                            {o.pickupAddress && <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8 }}><span style={{ fontSize: 13 }}>📍</span><span style={{ fontSize: 13, color: "#1a3a5c" }}>{o.pickupAddress}</span></div>}
                            {pd && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "#7a8a9a" }}>Metode Bayar</span><span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{pd.paymentMethod?.toUpperCase() ?? "-"}</span></div>}
                          </div>
                          {pd && (
                            <div style={{ background: "#f8fafc", borderTop: "1px solid #f0f4f8", padding: "14px 16px" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 10 }}>RINCIAN BIAYA</div>
                              {[
                                { label: "Biaya Jasa", val: pd.biayaJasa },
                                ...(pd.biayaSparepart > 0 ? [{ label: "Biaya Sparepart", val: pd.biayaSparepart }] : []),
                                { label: "Biaya Panggilan", val: pd.biayaPanggilan },
                                { label: "Biaya Layanan & Admin", val: pd.biayaLayanan },
                              ].map(row => (
                                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                  <span style={{ fontSize: 13, color: "#4a5a6a" }}>{row.label}</span>
                                  <span style={{ fontSize: 13, color: "#4a5a6a" }}>{fmtRp(row.val)}</span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid #e0e8f0", marginTop: 4 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: "#1a3a5c" }}>{fmtRp(pd.total)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>}

        {/* ══ CHAT TAB ══ */}
        {activeTab === "chat" && <div style={{ padding: "16px 10px" }}>
          {/* Sub-tab pills */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {([
              { id: "aktif" as const, label: "Chat Aktif", count: activeOrder ? 1 : 0 },
              { id: "riwayat" as const, label: "Riwayat Chat", count: orderHistory.length },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setChatSubTab(tab.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 24, border: chatSubTab === tab.id ? "none" : "1.5px solid #d0dce8", background: chatSubTab === tab.id ? "#1a3a5c" : "#fff", color: chatSubTab === tab.id ? "#fff" : "#7a8a9a", fontWeight: chatSubTab === tab.id ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                {tab.label}
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: chatSubTab === tab.id ? "rgba(255,255,255,0.25)" : "#e8f0f8", color: chatSubTab === tab.id ? "#fff" : "#4a5a6a", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Chat Aktif */}
          {chatSubTab === "aktif" && (
            activeOrder ? (
              <div style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f4f8", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>💬</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Chat dengan Mitra</div>
                    <div style={{ fontSize: 12, color: "#7a8a9a" }}>#{activeOrder.orderNo}</div>
                  </div>
                  <span style={{ fontSize: 11, background: "#1a7a6a", color: "#fff", borderRadius: 10, padding: "2px 10px", fontWeight: 700 }}>Live</span>
                </div>
                <div style={{ height: 320, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, background: "#f8fafc" }}>
                  {chatMsgs.length === 0
                    ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#b0bec5", fontSize: 13 }}>Belum ada pesan</div>
                    : chatMsgs.map(m => {
                        const isMe = m.senderRole === "pengguna";
                        return (
                          <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                            <div style={{ maxWidth: "78%", background: isMe ? "linear-gradient(135deg, #1a3a5c, #1a7a6a)" : "#fff", color: isMe ? "#fff" : "#1a2a3a", borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "8px 12px", fontSize: 13, lineHeight: 1.4, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", whiteSpace: "pre-wrap" }}>
                              {m.message}
                            </div>
                          </div>
                        );
                      })
                  }
                  <div ref={chatBottomRef} />
                </div>
                <div style={{ padding: "10px 12px", borderTop: "1px solid #f0f4f8", display: "flex", gap: 8 }}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                    placeholder="Tulis pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1.5px solid #e0e8f0", outline: "none", fontSize: 13, background: "#f8fafc" }} />
                  <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                    style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: chatInput.trim() ? "linear-gradient(135deg, #1a7a6a, #1a3a5c)" : "#e0e8f0", color: "#fff", fontSize: 14, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>➤</button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "56px 24px" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Tidak ada chat aktif</div>
                <div style={{ fontSize: 13, color: "#9aa5b4" }}>Chat tersedia saat ada order yang sedang berjalan</div>
              </div>
            )
          )}

          {/* Riwayat Chat */}
          {chatSubTab === "riwayat" && (
            orderHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 24px" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🗂️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada riwayat chat</div>
                <div style={{ fontSize: 13, color: "#9aa5b4" }}>Riwayat chat akan muncul di sini setelah order selesai</div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                {orderHistory.map((o, i) => {
                  const svc = getSvc(o.serviceType);
                  return (
                    <div key={o.id}>
                      {i > 0 && <div style={{ height: 1, background: "#f0f4f8" }} />}
                      <button onClick={() => fetchChatHistory(o.id)} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", textAlign: "left" as const }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{svc.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{svc.label}</div>
                          <div style={{ fontSize: 12, color: "#7a8a9a" }}>{o.vehicleModel} · {fmtDate(o.createdAt)}</div>
                        </div>
                        <span style={{ fontSize: 14, color: "#1a7a6a", fontWeight: 700 }}>{chatHistoryOrderId === o.id ? "▲" : "▼"}</span>
                      </button>
                      {chatHistoryOrderId === o.id && (
                        <div style={{ background: "#f8fafc", borderTop: "1px solid #f0f4f8", padding: "10px 14px 14px", maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                          {loadingChatHistory
                            ? <div style={{ textAlign: "center", padding: "20px", color: "#9aa5b4", fontSize: 13 }}>Memuat pesan...</div>
                            : chatHistoryMsgs.length === 0
                              ? <div style={{ textAlign: "center", padding: "20px", color: "#9aa5b4", fontSize: 13 }}>Tidak ada pesan tersimpan</div>
                              : chatHistoryMsgs.map(m => {
                                  const isMe = m.senderRole === "pengguna";
                                  return (
                                    <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                      <div style={{ maxWidth: "78%", background: isMe ? "linear-gradient(135deg, #1a3a5c, #1a7a6a)" : "#fff", color: isMe ? "#fff" : "#1a2a3a", borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "7px 11px", fontSize: 12, lineHeight: 1.4, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "pre-wrap" }}>
                                        {m.message}
                                      </div>
                                    </div>
                                  );
                                })
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>}

        {/* ══ AKUN TAB ══ */}
        {activeTab === "akun" && <div style={{ padding: "16px 10px" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "28px 20px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", textAlign: "center" as const }}>
            <div style={{ width: 72, height: 72, borderRadius: 24, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 auto 14px" }}>
              {(user?.name ?? "U").charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a3a" }}>{user?.name ?? "-"}</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", marginTop: 4 }}>Pengguna RIDE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "📋", label: "Riwayat Pesanan", count: orderHistory.length, action: () => { setActiveTab("pesanan"); setPesananSubTab("riwayat"); } },
              { icon: "💬", label: "Riwayat Chat", count: orderHistory.length, action: () => { setActiveTab("chat"); setChatSubTab("riwayat"); } },
            ].map(item => (
              <button key={item.label} onClick={item.action} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "100%", textAlign: "left" as const }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>{item.count} order selesai</div>
                </div>
                <span style={{ fontSize: 18, color: "#b0bec5" }}>›</span>
              </button>
            ))}
            <button onClick={() => fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => navigate("/login"))}
              style={{ background: "#fff0f0", borderRadius: 16, padding: "14px 16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", width: "100%", textAlign: "left" as const }}>
              <span style={{ fontSize: 22 }}>🚪</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e74c3c" }}>Keluar</span>
            </button>
          </div>
        </div>}

      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8ecf0", display: "flex", zIndex: 1000 }}>
        {([
          { id: "beranda" as TabId, icon: "🏠", label: "Beranda", badge: 0 },
          { id: "pesanan" as TabId, icon: "📋", label: "Pesanan", badge: activeOrder ? 1 : 0 },
          { id: "chat" as TabId, icon: "💬", label: "Chat", badge: activeOrder ? 1 : 0 },
          { id: "akun" as TabId, icon: "👤", label: "Akun", badge: 0 },
        ]).map(item => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 6px", background: "none", border: "none", cursor: "pointer", position: "relative" }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? "#1a7a6a" : "#9aa5b4" }}>{item.label}</span>
              {item.badge > 0 && (
                <span style={{ position: "absolute", top: 6, right: "calc(50% - 20px)", background: "#e74c3c", color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 700, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>{item.badge}</span>
              )}
              {isActive && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 3, background: "#1a7a6a", borderRadius: 2 }} />}
            </button>
          );
        })}
      </div>

      {/* Semua Layanan Overlay */}
      {showAllServices && (
        <div style={{ position: "fixed", inset: 0, background: "#f0f4f8", zIndex: 3000, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 100%)", padding: "52px 14px 24px", flexShrink: 0 }}>
            <button
              onClick={() => setShowAllServices(false)}
              style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px", backdropFilter: "blur(4px)", marginBottom: 16 }}
            >&lt;-</button>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>Semua Layanan</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 }}>{ACTIVE_SERVICES.length + COMING_SOON_SERVICES.length} layanan tersedia</div>
          </div>

          {/* White content */}
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", flex: 1, padding: "26px 14px 40px", marginTop: -12 }}>
            {/* Active services grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
              {ACTIVE_SERVICES.map(s => {
                const route = SERVICE_ROUTES[s.id];
                return (
                  <div
                    key={s.id}
                    onClick={() => { setShowAllServices(false); if (route) navigate(route); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: route ? "pointer" : "default" }}
                  >
                    <div style={{ width: "100%", aspectRatio: "1", borderRadius: 20, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                      {s.emoji}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a2a3a", textAlign: "center", lineHeight: 1.3 }}>{s.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 1, background: "#e0e8f0" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9aa5b4", letterSpacing: 1.5 }}>SEGERA HADIR</span>
              <div style={{ flex: 1, height: 1, background: "#e0e8f0" }} />
            </div>

            {/* Coming soon grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {COMING_SOON_SERVICES.map(s => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 20, background: "#c8d4e0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 32, position: "relative", overflow: "hidden" }}>
                    <span style={{ filter: "grayscale(0.4) opacity(0.6)" }}>{s.emoji}</span>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(80,100,120,0.82)", padding: "5px 0", textAlign: "center" }}>
                      <span style={{ color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>COMING SOON</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#9aa5b4", textAlign: "center", lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", marginTop: "auto", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #e8ecf0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Pilih Lokasi Kamu</div>
              <button onClick={() => { setShowLocationPicker(false); if (pickerLeafletRef.current) { pickerLeafletRef.current.remove(); pickerLeafletRef.current = null; } }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9aa5b4" }}>✕</button>
            </div>
            <div style={{ color: "#7a8a9a", fontSize: 13, padding: "8px 14px", background: "#f8f9fa" }}>
              📍 Seret pin atau tap peta untuk memilih lokasi
            </div>
            <div ref={pickerMapRef} style={{ flex: 1 }} />
            <div style={{ padding: "16px 14px", borderTop: "1px solid #e8ecf0" }}>
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
