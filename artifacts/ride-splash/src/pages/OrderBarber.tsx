import { useState, useRef, useEffect, useCallback } from "react";
import { calcBiayaPanggilan, calcEtaMinutes, calcEtaSecsLive } from "../utils/pricing";
import { useLocation } from "wouter";
import ReviewModal from "@/components/ReviewModal";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

const STEPS = [
  { label: "Layanan", emoji: "✂️" },
  { label: "Lokasi", emoji: "📍" },
  { label: "Barberman", emoji: "💈" },
  { label: "Tracking", emoji: "📡" },
  { label: "Bayar", emoji: "💳" },
];

const LAYANAN_PER_GENDER: Record<string, string[]> = {
  "Dewasa Pria": ["Potong Rambut", "Potong + Cuci", "Potong + Cuci + Blow", "Cukur Jenggot", "Potong + Cukur Jenggot", "Creambath Pria"],
  "Dewasa Wanita": ["Potong Rambut", "Potong + Cuci", "Potong + Cuci + Blow", "Potong + Creambath", "Hair Mask", "Smoothing Parsial"],
  "Anak-anak": ["Potong Anak", "Potong + Cuci Anak", "Potong + Cuci + Blow Anak"],
};

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`, { headers: { "Accept-Language": "id" } });
    const data = await res.json();
    const addr = data.address;
    const parts = [addr.road || addr.pedestrian, addr.suburb || addr.neighbourhood, addr.city || addr.town].filter(Boolean);
    return parts.join(", ") || data.display_name?.split(",").slice(0, 3).join(",") || "";
  } catch { return ""; }
}

function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function StepProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {STEPS.map((s, i) => {
        const isActive = i + 1 === step, isDone = i + 1 < step;
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: isActive ? "#fff" : isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)", border: isActive ? "none" : "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isActive ? 18 : 14 }}>
                {isDone ? <span style={{ color: "#f5a623", fontSize: 16, fontWeight: 900 }}>✓</span> : <span>{s.emoji}</span>}
              </div>
              <div style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap" }}>{s.label}</div>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: isDone ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)", margin: "0 4px", marginBottom: 16 }} />}
          </div>
        );
      })}
    </div>
  );
}

const ACCENT = "#7c2a2a";
const ACCENT2 = "#5c1a1a";

export default function OrderBarber() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Step 1
  const [untukSiapa, setUntukSiapa] = useState("Dewasa Pria");
  const [layanan, setLayanan] = useState("");
  const canNext1 = layanan !== "";

  const handleGenderChange = (g: string) => { setUntukSiapa(g); setLayanan(""); };

  // Shared state
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [autoAddress, setAutoAddress] = useState("");
  const [detailAlamat, setDetailAlamat] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  type AcceptedMitra = { id: number; name: string; lat: number; lng: number; serviceType: string; rating: number | null; totalOrders: number; dist: number; callFee: number; etaMin: number; };
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [orderStatus, setOrderStatus] = useState<"creating"|"pending"|"accepted"|"done"|"cancelled">("creating");
  const [acceptedMitra, setAcceptedMitra] = useState<AcceptedMitra | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const orderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  type ChatMsg = { id: number; senderRole: string; message: string; createdAt: string };
  const [chatOpen, setChatOpen] = useState(false);
  const [mitraConfirmed, setMitraConfirmed] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null);

  const [mitraTrackLat, setMitraTrackLat] = useState<number | null>(null);
  const [mitraTrackLng, setMitraTrackLng] = useState<number | null>(null);
  const [trackDist, setTrackDist] = useState<number | null>(null);
  const [trackEta, setTrackEta] = useState<number | null>(null);
  const [trackingPhase, setTrackingPhase] = useState<string>("menuju");
  type PaymentData = { biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string };
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [voucherMsg, setVoucherMsg] = useState("");
  const [paymentMethodUser, setPaymentMethodUser] = useState<"cash"|"transfer"|"qris">("cash");
  const trackMapRef = useRef<HTMLDivElement>(null);
  const trackLeafletRef = useRef<L.Map | null>(null);
  const trackMitraMarkerRef = useRef<L.Marker | null>(null);
  const trackUserMarkerRef = useRef<L.Marker | null>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const step5PollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json()).then(me => { if (me.id) identifySocket(me.id, "pengguna"); }).catch(() => {});
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (!resumeId) return;
    fetch(`/api/pengguna/orders/${resumeId}`, { credentials: "include" }).then(r => r.json()).then(data => {
      if (data.status !== "accepted" || !data.mitra) return;
      const pLat: number = data.pickupLat ?? 0, pLng: number = data.pickupLng ?? 0;
      const dist = haversineDist(data.mitra.lat, data.mitra.lng, pLat, pLng);
      setOrderId(data.id); setOrderNo(data.orderNo); setOrderStatus("accepted");
      setPinLat(pLat); setPinLng(pLng); setAutoAddress(data.pickupAddress || "");
      setAcceptedMitra({ id: data.mitra.id, name: data.mitra.name, lat: data.mitra.lat, lng: data.mitra.lng, serviceType: data.mitra.serviceType || "", rating: data.mitra.rating ?? null, totalOrders: data.mitra.totalOrders ?? 0, dist, callFee: data.totalAmount ?? 0, etaMin: Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60) });
      setMitraConfirmed(true);
      if (data.trackingPhase === "selesai") { if (data.paymentData) setPaymentData(data.paymentData); setStep(5); } else { setStep(4); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 2 || !mapRef.current || leafletMapRef.current) return;
    const lat = userLat ?? -1.2654, lng = userLng ?? 116.8312;
    const map = L.map(mapRef.current, { center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    if (userLat !== null && userLng !== null) gpsMarkerRef.current = L.circleMarker([userLat, userLng], { radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3 }).addTo(map);
    setPinLat(lat); setPinLng(lng);
    setIsGeocoding(true); reverseGeocode(lat, lng).then(addr => { setAutoAddress(addr); setIsGeocoding(false); });
    map.on("moveend", () => { const c = map.getCenter(); setPinLat(c.lat); setPinLng(c.lng); setIsGeocoding(true); reverseGeocode(c.lat, c.lng).then(addr => { setAutoAddress(addr); setIsGeocoding(false); }); });
    leafletMapRef.current = map;
  }, [step, userLat, userLng]);

  useEffect(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    if (gpsMarkerRef.current) gpsMarkerRef.current.setLatLng([userLat, userLng]);
    else gpsMarkerRef.current = L.circleMarker([userLat, userLng], { radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3 }).addTo(leafletMapRef.current!);
  }, [userLat, userLng]);

  useEffect(() => { return () => { if (step === 2 && leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; gpsMarkerRef.current = null; } }; }, [step]);

  function calcDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  useEffect(() => {
    if (step !== 3 || orderId) return;
    setOrderStatus("creating"); setAcceptedMitra(null); setCreateError(null);
    fetch("/api/pengguna/orders", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ vehicleType: untukSiapa, vehicleModel: layanan, vehicleYear: "", damageCategories: [layanan], description: "", pickupAddress: autoAddress || "Lokasi yang dipilih", detailAlamat, pickupLat: pinLat ?? userLat ?? 0, pickupLng: pinLng ?? userLng ?? 0, serviceType: "barber" }) })
      .then(r => r.json()).then(d => { if (!d.orderId) { setCreateError("Gagal membuat pesanan."); return; } setOrderId(d.orderId); setOrderNo(d.orderNo); setOrderStatus("pending"); }).catch(() => setCreateError("Koneksi gagal."));
  }, [step, orderId]);

  useEffect(() => {
    if (step !== 3 || !orderId || orderStatus !== "pending") return;
    const lat = pinLat ?? userLat ?? 0, lng = pinLng ?? userLng ?? 0;
    const applyOd = (od: any) => {
      if (od.status === "accepted" && od.mitra) {
        if (orderPollRef.current) clearInterval(orderPollRef.current);
        const dist = calcDist(lat, lng, od.mitra.lat ?? 0, od.mitra.lng ?? 0);
        setAcceptedMitra({ id: od.mitra.id, name: od.mitra.name, lat: od.mitra.lat ?? 0, lng: od.mitra.lng ?? 0, serviceType: od.mitra.serviceType, rating: od.mitra.rating ?? null, totalOrders: od.mitra.totalOrders ?? 0, dist, callFee: od.totalAmount ?? calcBiayaPanggilan("barber", dist), etaMin: Math.ceil(calcEtaSecsLive(dist, od.mitra?.speedKmh) / 60) });
        setOrderStatus("accepted");
      } else if (od.status === "cancelled") { if (orderPollRef.current) clearInterval(orderPollRef.current); setOrderStatus("cancelled"); }
    };
    const doPoll = async () => { try { const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" }); if (!res.ok) return; applyOd(await res.json()); } catch { } };
    const onAccepted = (data: any) => { if (data.orderId !== orderId) return; fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" }).then(r => r.json()).then(applyOd).catch(() => {}); };
    socket.on("order:accepted", onAccepted);
    doPoll(); orderPollRef.current = setInterval(doPoll, 30000);
    return () => { if (orderPollRef.current) clearInterval(orderPollRef.current); socket.off("order:accepted", onAccepted); };
  }, [step, orderId, orderStatus, pinLat, pinLng, userLat, userLng]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !orderId || chatSending) return;
    setChatSending(true);
    try { const r = await fetch(`/api/chat/${orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: chatInput.trim() }) }); if (r.status === 401) { alert("Sesi Anda telah habis. Silakan login ulang."); window.location.href = "/"; return; } setChatInput(""); } catch { } finally { setChatSending(false); }
  }, [chatInput, orderId, chatSending]);

  useEffect(() => {
    if ((orderStatus !== "accepted" && step !== 4) || !orderId) return;
    fetch(`/api/chat/${orderId}`, { credentials: "include" }).then(r => r.json()).then(d => { setChatMessages(d.messages ?? []); setTimeout(() => { const el = chatBottomRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, 50); }).catch(() => {});
    joinOrderRoom(orderId);
    const onChat = (data: any) => { if (data.orderId !== orderId) return; setChatMessages(prev => { if (prev.some((m: any) => m.id === data.id)) return prev; const next = [...prev, data]; setTimeout(() => { const el = chatBottomRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, 50); return next; }); };
    socket.on("chat:message", onChat);
    const onCancelledByMitra = (data: { orderId: number; canceledBy?: string }) => {
      if (data.orderId !== orderId) return;
      setOrderStatus("cancelled");
    };
    socket.on("order:cancelled", onCancelledByMitra);
    return () => { leaveOrderRoom(orderId); socket.off("chat:message", onChat); socket.off("order:cancelled", onCancelledByMitra); };
  }, [orderStatus, orderId]);

  useEffect(() => {
    if (step !== 4 || !orderId || !pinLat || !pinLng) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" }); const data = await res.json();
        const mLat: number | null = data.mitra?.lat ?? null, mLng: number | null = data.mitra?.lng ?? null;
        if (mLat && mLng) { setMitraTrackLat(mLat); setMitraTrackLng(mLng); const dist = haversineDist(mLat, mLng, pinLat, pinLng); setTrackDist(dist); setTrackEta(Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60)); }
        if (data.trackingPhase) setTrackingPhase(data.trackingPhase);
        if (data.paymentData) setPaymentData(data.paymentData);
        if (data.trackingPhase === "selesai") setStep(5);
      } catch { }
    };
    const onPhase = (data: any) => { if (data.orderId !== orderId) return; setTrackingPhase(data.phase); if (data.phase === "selesai") setStep(5); };
    const onPayment = (data: any) => { if (data.orderId !== orderId) return; setPaymentData(data.paymentData); };
    const onDone = (data: any) => { if (data.orderId !== orderId) return; setOrderStatus("done"); };
    socket.on("order:phase", onPhase); socket.on("order:payment", onPayment); socket.on("order:done", onDone);
    poll(); trackingPollRef.current = setInterval(poll, 4000);
    return () => { if (trackingPollRef.current) clearInterval(trackingPollRef.current); socket.off("order:phase", onPhase); socket.off("order:payment", onPayment); socket.off("order:done", onDone); };
  }, [step, orderId, pinLat, pinLng]);

  useEffect(() => {
    if (step !== 5 || !orderId) return;
    const onPayment = (data: any) => { if (data.orderId !== orderId) return; setPaymentData(data.paymentData); };
    const onDone = (data: any) => { if (data.orderId !== orderId) return; setOrderStatus("done"); };
    socket.on("order:payment", onPayment); socket.on("order:done", onDone);
    const poll = async () => { try { const res = await fetch(`/api/pengguna/orders/${orderId}?t=${Date.now()}`, { credentials: "include" }); if (!res.ok) return; const data = await res.json(); if (data.paymentData) setPaymentData(data.paymentData); if (data.status === "done") setOrderStatus("done"); } catch { } };
    poll(); step5PollRef.current = setInterval(poll, 30000);
    return () => { if (step5PollRef.current) clearInterval(step5PollRef.current); socket.off("order:payment", onPayment); socket.off("order:done", onDone); };
  }, [step, orderId]);

  useEffect(() => {
    if (step !== 4 || !trackMapRef.current || !pinLat || !pinLng) return;
    if (!trackLeafletRef.current) {
      const map = L.map(trackMapRef.current, { zoomControl: false, attributionControl: false }).setView([mitraTrackLat ?? pinLat, mitraTrackLng ?? pinLng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const uIcon = L.divIcon({ html: '<div style="width:28px;height:28px;background:#e53e3e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;display:flex;align-items:center;justify-content:center;">📍</div>', iconSize: [28,28], iconAnchor: [14,28], className: "" });
      trackUserMarkerRef.current = L.marker([pinLat, pinLng], { icon: uIcon }).addTo(map).bindPopup("Lokasi Anda");
      const mIcon = L.divIcon({ html: '<div style="width:34px;height:34px;background:#7c2a2a;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:16px;display:flex;align-items:center;justify-content:center;">💈</div>', iconSize: [34,34], iconAnchor: [17,17], className: "" });
      if (mitraTrackLat && mitraTrackLng) { trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mIcon }).addTo(map).bindPopup("Barberman"); map.fitBounds(L.latLngBounds([[pinLat,pinLng],[mitraTrackLat,mitraTrackLng]]), { padding: [40,40] }); }
      trackLeafletRef.current = map;
    } else if (mitraTrackLat && mitraTrackLng && trackMitraMarkerRef.current) {
      trackMitraMarkerRef.current.setLatLng([mitraTrackLat, mitraTrackLng]);
      if (pinLat && pinLng) trackLeafletRef.current!.fitBounds(L.latLngBounds([[pinLat,pinLng],[mitraTrackLat,mitraTrackLng]]), { padding: [40,40] });
    }
  }, [step, pinLat, pinLng, mitraTrackLat, mitraTrackLng]);

  useEffect(() => { return () => { if (step === 4 && trackLeafletRef.current) { trackLeafletRef.current.remove(); trackLeafletRef.current = null; } }; }, [step]);

  const snapToGps = useCallback(() => { if (!leafletMapRef.current || userLat === null || userLng === null) return; leafletMapRef.current.setView([userLat, userLng], 16, { animate: true }); }, [userLat, userLng]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden" }}>
      <div style={{ background: `linear-gradient(160deg, #2a0d0d 0%, #5c1a1a 60%, ${ACCENT} 100%)`, padding: "52px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {step !== 3 && <button onClick={() => { if (step === 1) navigate("/dashboard/pengguna"); else if (step === 2) setStep(1); else navigate("/dashboard/pengguna"); }} style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}>&lt;-</button>}
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>✂️ Pangkas Rambut</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Pesan layanan sekarang</div>
          </div>
        </div>
        <StepProgress step={step} />
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20 }}>✂️ Pilih Layanan</div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Untuk Siapa</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Dewasa Pria", "Dewasa Wanita", "Anak-anak"].map(g => (
                    <button key={g} onClick={() => handleGenderChange(g)}
                      style={{ flex: 1, padding: "11px 6px", borderRadius: 20, border: untukSiapa === g ? `2px solid ${ACCENT}` : "1.5px solid #d0dce8", background: untukSiapa === g ? `rgba(124,42,42,0.08)` : "#f8fafc", color: untukSiapa === g ? ACCENT : "#4a5568", fontWeight: untukSiapa === g ? 700 : 500, fontSize: 12, cursor: "pointer" }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 12 }}>Pilih Layanan</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {LAYANAN_PER_GENDER[untukSiapa].map(l => (
                    <button key={l} onClick={() => setLayanan(l)}
                      style={{ width: "100%", padding: "16px 18px", borderRadius: 14, border: layanan === l ? `2px solid ${ACCENT}` : "1.5px solid #e0e8f0", background: layanan === l ? `rgba(124,42,42,0.06)` : "#fff", color: layanan === l ? ACCENT : "#1a2a3a", fontWeight: layanan === l ? 700 : 500, fontSize: 15, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 10, fontStyle: "italic" }}>*Biaya jasa akan didiskusikan via chat dengan barberman</div>
              </div>
            </div>
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
            <button disabled={!canNext1} onClick={() => setStep(2)}
              style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: canNext1 ? `linear-gradient(135deg, ${ACCENT2} 0%, ${ACCENT} 100%)` : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext1 ? "pointer" : "not-allowed" }}>
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 16 }}>📍 Pilih Lokasi</div>
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 20, height: 260 }}>
                <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", marginBottom: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}><div style={{ fontSize: 11, fontWeight: 700, color: "#1a2a3a", whiteSpace: "nowrap" }}>{isGeocoding ? "Memuat..." : "Posisi Anda"}</div></div>
                  <span style={{ fontSize: 32, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>📍</span>
                </div>
                <button onClick={snapToGps} style={{ position: "absolute", bottom: 12, right: 12, zIndex: 1000, width: 42, height: 42, borderRadius: 12, background: "#fff", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}><span style={{ fontSize: 16 }}>🎯</span><span style={{ fontSize: 8, fontWeight: 800, color: "#1a3a5c", letterSpacing: 0.5 }}>GPS</span></button>
              </div>
              {autoAddress && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: "rgba(124,42,42,0.06)", borderRadius: 12, marginBottom: 16, border: `1px solid rgba(124,42,42,0.15)` }}><span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span><span style={{ fontSize: 13, color: "#1a2a3a", lineHeight: 1.4 }}>{autoAddress}</span></div>}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Detail Alamat / Panduan Masuk</label>
                <textarea value={detailAlamat} onChange={e => setDetailAlamat(e.target.value)} placeholder="Depan rumah, kode pagar, blok..." rows={3} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }} />
              </div>
            </div>
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100, display: "flex", gap: 12 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: "17px", borderRadius: 16, border: `1.5px solid ${ACCENT}`, background: "#fff", color: ACCENT, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>← Kembali</button>
            <button onClick={() => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; gpsMarkerRef.current = null; } setStep(3); }} style={{ flex: 2, padding: "17px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${ACCENT2} 0%, ${ACCENT} 100%)`, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Lanjut →</button>
          </div>
        </>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 24 }}>💈 Cari Barberman</div>
              {(orderStatus === "creating" || createError) && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0 24px" }}>
                  {createError ? (<><span style={{ fontSize: 48 }}>⚠️</span><div style={{ fontSize: 14, color: "#ea580c", fontWeight: 600, textAlign: "center" }}>{createError}</div><button onClick={() => navigate("/dashboard/pengguna")} style={{ padding: "12px 32px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button></>) : (<><div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="search-pulse" /><div className="search-spinner" /></div><div style={{ fontSize: 14, color: "#7a8a9a" }}>Membuat pesanan...</div></>)}
                </div>
              )}
              {orderStatus === "pending" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 0 16px" }}>
                  <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="search-pulse" /><div className="search-spinner" /></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: 17, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Mencari Barberman Terdekat...</div><div style={{ fontSize: 13, color: "#7a8a9a" }}>Menghubungi barberman di sekitar lokasi Anda.</div></div>
                  {orderNo && <div style={{ fontSize: 12, color: "#9aa5b4", fontWeight: 600 }}>No. Pesanan: {orderNo}</div>}
                  <button onClick={async () => { if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }); if (orderPollRef.current) clearInterval(orderPollRef.current); navigate("/dashboard/pengguna"); }} style={{ marginTop: 8, padding: "12px 32px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✕ Batalkan</button>
                </div>
              )}
              {orderStatus === "accepted" && acceptedMitra && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#e8f8f2", borderRadius: 14, border: "1.5px solid #b2e8d4" }}><span style={{ fontSize: 22 }}>✅</span><div style={{ fontSize: 15, fontWeight: 700, color: "#1a7a6a" }}>Barberman Ditemukan!</div></div>
                  <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 18, padding: "18px 16px", background: "#fff" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 14, background: `rgba(124,42,42,0.08)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>💈</div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a", marginBottom: 3 }}>{acceptedMitra.name}</div><div style={{ fontSize: 13, color: "#f5a623", fontWeight: 700, marginBottom: 3 }}>⭐ {acceptedMitra.rating ?? "–"}{acceptedMitra.totalOrders > 0 ? ` · ${acceptedMitra.totalOrders} order` : ""}</div><div style={{ fontSize: 12, color: "#4a5568" }}>{acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist*1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`} · Est. {acceptedMitra.etaMin} menit</div></div>
                    </div>
                    <div style={{ display: "flex", marginBottom: 14, borderTop: "1px solid #f0f4f8", paddingTop: 14 }}>
                      <div style={{ flex: 1, paddingRight: 14 }}><div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Biaya Panggilan</div><div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>Rp {acceptedMitra.callFee.toLocaleString("id-ID")}</div></div>
                      <div style={{ width: 1, background: "#e0e8f0", margin: "0 14px 0 0" }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Est. Tiba</div><div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>± {acceptedMitra.etaMin} menit</div></div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "rgba(245,166,35,0.08)", borderRadius: 12, border: "1px solid rgba(245,166,35,0.2)" }}><span style={{ fontSize: 15 }}>💡</span><div><div style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>Diskusikan biaya jasa dengan barberman</div><div style={{ fontSize: 11, color: "#92400e", marginTop: 1 }}>Chat sebelum barberman berangkat</div></div></div>
                  </div>
                  <button onClick={() => setChatOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px", borderRadius: 14, border: "none", background: chatOpen ? ACCENT2 : `linear-gradient(135deg, ${ACCENT2} 0%, ${ACCENT} 100%)`, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 17 }}>💬</span>Chat & Negosiasi {chatOpen ? "∧" : "∨"}</button>
                  {chatOpen && (
                    <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}><div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div></div>
                      <div style={{ minHeight: 160, maxHeight: 220, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                        {chatMessages.length === 0 ? (<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0" }}><span style={{ fontSize: 32, opacity: 0.3 }}>💬</span><div style={{ fontSize: 12, color: "#b0bec5" }}>Mulai diskusi dengan barberman</div></div>) : chatMessages.map(m => { const isMine = m.senderRole === "pengguna"; return (<div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}><div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>{m.message}</div><span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></div>); })}
                        <div ref={chatBottomRef} />
                      </div>
                      <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                        <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChatMessage()} placeholder="Ketik pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }} />
                        <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? `linear-gradient(135deg,${ACCENT2},${ACCENT})` : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                      </div>
                    </div>
                  )}
                  <button onClick={async () => { if (orderId) await fetch(`/api/pengguna/orders/${orderId}/confirm`, { method: "PATCH", credentials: "include" }).catch(() => {}); setMitraConfirmed(true); setChatOpen(false); setStep(4); }} disabled={mitraConfirmed} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: mitraConfirmed ? "#a5d6a7" : "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: mitraConfirmed ? "default" : "pointer" }}>{mitraConfirmed ? "✅ Barberman Dikonfirmasi" : "✅ Setuju & Panggil Barberman"}</button>
                  {!mitraConfirmed && <button onClick={async () => { if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {}); if (orderPollRef.current) clearInterval(orderPollRef.current); if (chatPollRef.current) clearInterval(chatPollRef.current); setOrderId(null); setOrderNo(""); setOrderStatus("creating"); setAcceptedMitra(null); setChatMessages([]); setChatInput(""); setChatOpen(false); setMitraConfirmed(false); setStep(2); setTimeout(() => setStep(3), 50); }} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>🔄 Cari Barberman Lain</button>}
                </div>
              )}
              {orderStatus === "cancelled" && (<div style={{ textAlign: "center", padding: "32px 0" }}><span style={{ fontSize: 52 }}>😔</span><div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginTop: 12 }}>Pesanan Dibatalkan</div><button onClick={() => navigate("/dashboard/pengguna")} style={{ marginTop: 16, padding: "12px 32px", borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button></div>)}
            </div>
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 14px 20px", background: "linear-gradient(to top, #f0f4f8 90%, transparent)", zIndex: 100 }}>
            {orderStatus === "accepted" && !mitraConfirmed ? (
              <button onClick={async () => { if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {}); if (orderPollRef.current) clearInterval(orderPollRef.current); if (chatPollRef.current) clearInterval(chatPollRef.current); navigate("/dashboard/pengguna"); }} style={{ width: "100%", padding: "15px", borderRadius: 16, border: "1.5px solid #e8a0a0", background: "#fff5f5", color: "#c0392b", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✕ Batalkan Pesanan</button>
            ) : orderStatus !== "accepted" ? (
              <button disabled style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "not-allowed" }}>{orderStatus === "creating" ? "Membuat pesanan..." : "Menunggu Barberman Menerima..."}</button>
            ) : null}
          </div>
        </>
      )}

      {/* STEP 4 */}
      {step === 4 && acceptedMitra && (
        <>
          {orderStatus === "cancelled" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center" }}>
              <span style={{ fontSize: 56 }}>😔</span>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", marginTop: 14 }}>Pesanan Dibatalkan</div>
              <div style={{ fontSize: 13, color: "#7a8a9a", marginTop: 6 }}>Mitra membatalkan pesanan ini. Silakan pesan kembali.</div>
              <button onClick={() => navigate("/dashboard/pengguna")} style={{ marginTop: 20, padding: "13px 36px", borderRadius: 14, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali ke Beranda</button>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 0 100px", display: orderStatus === "cancelled" ? "none" : undefined }}>
            <div style={{ position: "relative", width: "100%", height: 220 }}>
              <div ref={trackMapRef} style={{ width: "100%", height: "100%" }} />
              <div style={{ position: "absolute", top: 12, right: 12, zIndex: 500, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: "rgba(26,58,92,0.92)", backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 13, fontWeight: 700 }}>🕐 {trackEta != null ? `± ${trackEta} menit` : `± ${acceptedMitra.etaMin} menit`}</div>
                <div style={{ background: `rgba(124,42,42,0.9)`, backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 600 }}>📏 {trackDist != null ? (trackDist < 1 ? `${Math.round(trackDist*1000)} m` : `${trackDist.toFixed(1)} km`) : `${acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist*1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`}`}</div>
              </div>
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 500, background: ACCENT, borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700 }}>💈 Barberman dalam perjalanan...</div>
            </div>
            <div style={{ padding: "16px 14px 0" }}>
              <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", marginBottom: 16, background: "#fff" }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: `linear-gradient(135deg, ${ACCENT2}, ${ACCENT})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>💈</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a" }}>{acceptedMitra.name}</div><div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>✅ Barberman Terverifikasi RIDE</div><div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{acceptedMitra.rating != null ? `⭐ ${acceptedMitra.rating}` : "⭐ Baru"} · {acceptedMitra.totalOrders} order</div></div>
                <button onClick={() => setChatOpen(o => !o)} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${ACCENT}`, background: "#fff", color: ACCENT, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>💬 Chat</button>
              </div>
              {chatOpen && (
                <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}><div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div></div>
                  <div style={{ minHeight: 120, maxHeight: 200, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                    {chatMessages.map(m => { const isMine = m.senderRole === "pengguna"; return (<div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}><div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>{m.message}</div><span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></div>); })}
                    <div ref={chatBottomRef} />
                  </div>
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChatMessage()} placeholder="Ketik pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }} />
                    <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? `linear-gradient(135deg,${ACCENT2},${ACCENT})` : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                  </div>
                </div>
              )}
              <div style={{ background: "#fff", border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>📍 Status Perjalanan</div>
                {(["menuju","tiba","pengerjaan","selesai"]).map((key, i) => {
                  const labels = ["Barberman menuju lokasi Anda","Barberman sudah tiba","Sedang proses pangkas","Pangkas rambut selesai ✅"];
                  const curIdx = ["menuju","tiba","pengerjaan","selesai"].indexOf(trackingPhase);
                  const done = i < curIdx, active = i === curIdx;
                  return (<div key={key} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, background: done ? "#1a7a6a" : active ? ACCENT : "#e0e8f0", display: "flex", alignItems: "center", justifyContent: "center", border: active ? `2px solid ${ACCENT}` : "none" }}>
                        {done ? <span style={{ color: "#fff", fontSize: 11 }}>✓</span> : active ? <div style={{ width: 7, height: 7, borderRadius: 4, background: "#fff" }} /> : <div style={{ width: 6, height: 6, borderRadius: 3, background: "#c0d0dc" }} />}
                      </div>
                      {i < 3 && <div style={{ width: 2, height: 28, background: "#e0e8f0", margin: "3px 0" }} />}
                    </div>
                    <div style={{ paddingBottom: 14 }}><div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "#1a2a3a" : "#9aa5b4" }}>{labels[i]}</div>{active && <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600, marginTop: 1 }}>• Sekarang</div>}</div>
                  </div>);
                })}
              </div>
            </div>
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 14px 20px", background: "linear-gradient(to top, #f0f4f8 90%, transparent)", zIndex: 100 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => navigate("/dashboard/pengguna")} style={{ flex: 1, padding: "15px", borderRadius: 16, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
              <button disabled style={{ flex: 2, padding: "15px", borderRadius: 16, border: "none", background: "#d0d8e0", color: "#a0aab4", fontWeight: 700, fontSize: 15, cursor: "not-allowed" }}>Lanjut →</button>
            </div>
          </div>
        </>
      )}

      {/* STEP 5 */}
      {step === 5 && (() => {
        const fmtIdr = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
        const discountAmt = voucherDiscount;
        const finalTotal = paymentData ? Math.max(0, paymentData.total - discountAmt) : 0;
        const pmLabel: Record<string,string> = { cash: "Bayar Tunai ke Barberman", transfer: "Transfer Bank", qris: "Bayar via QRIS" };
        const pmDesc: Record<string,string> = { cash: `Siapkan uang tunai sebesar ${fmtIdr(finalTotal)}.`, transfer: `Transfer ke rekening barberman sebesar ${fmtIdr(finalTotal)}.`, qris: `Scan QRIS barberman dan bayar sebesar ${fmtIdr(finalTotal)}.` };
        const pmIcon: Record<string,string> = { cash: "💵", transfer: "🏦", qris: "📱" };
        const selectedMethod = paymentMethodUser ?? paymentData?.paymentMethod ?? "cash";
        return (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 120px" }}>
              <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a", marginBottom: 14 }}>💳 Pembayaran</div>
                <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 14, padding: "12px 16px", marginBottom: 16, textAlign: "center" as const }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a" }}>✅ Layanan Selesai!</div><div style={{ fontSize: 12, color: "#4a9a7a", marginTop: 3 }}>Silakan selesaikan pembayaran</div></div>
                {!paymentData && <div style={{ background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e0e8f0", padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}><div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div><div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Menunggu barberman mengisi rincian biaya...</div></div>}
                {paymentData && !paymentConfirmed && (
                  <>
                    <div style={{ borderRadius: 14, border: "1.5px solid #e0e8f0", overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1 }}>RINCIAN BIAYA</div>
                      {[{ label: "Biaya Panggilan", val: paymentData.biayaPanggilan }, { label: "Jasa Pangkas", val: paymentData.biayaJasa }, ...(paymentData.biayaSparepart > 0 ? [{ label: "Produk Tambahan", val: paymentData.biayaSparepart }] : []), { label: "Biaya Layanan & Admin", val: paymentData.biayaLayanan }].map(row => (<div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f0f4f8" }}><span style={{ fontSize: 13, color: "#4a5a6a" }}>{row.label}</span><span style={{ fontSize: 13, color: "#1a2a3a" }}>{fmtIdr(row.val)}</span></div>))}
                      {discountAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f0f4f8", background: "#f0faf7" }}><span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>🎁 Diskon ({voucherCode.toUpperCase()})</span><span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>-{fmtIdr(discountAmt)}</span></div>}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px" }}><span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total</span><span style={{ fontSize: 15, fontWeight: 900, color: "#ea580c" }}>{fmtIdr(finalTotal)}</span></div>
                    </div>
                    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0e8f0", padding: "14px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>🎁 Kode Voucher</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={voucherCode} onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherDiscount(0); setVoucherMsg(""); }} placeholder="Contoh: RIDE10" style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", fontWeight: 600 }} />
                        <button onClick={async () => { if (!voucherCode || !paymentData) return; try { const r = await fetch(`/api/pengguna/vouchers/check?code=${encodeURIComponent(voucherCode)}&total=${paymentData.total}`, { credentials: "include" }); const d = await r.json(); if (d.valid) { setVoucherDiscount(d.discount); setVoucherMsg(`✅ Diskon ${fmtIdr(d.discount)}`); } else { setVoucherDiscount(0); setVoucherMsg(`❌ ${d.error}`); } } catch { setVoucherMsg("❌ Gagal cek voucher"); } }} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${ACCENT2}, ${ACCENT})`, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Pakai</button>
                      </div>
                      {voucherMsg && <div style={{ fontSize: 11, color: voucherMsg.startsWith("✅") ? "#1a7a6a" : "#dc2626", fontWeight: 600, marginTop: 6 }}>{voucherMsg}</div>}
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>Metode Pembayaran</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{(["cash","transfer","qris"] as const).map(m => (<button key={m} onClick={() => setPaymentMethodUser(m)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: selectedMethod === m ? `2px solid ${ACCENT}` : "1.5px solid #e0e8f0", background: selectedMethod === m ? `rgba(124,42,42,0.06)` : "#fff", color: selectedMethod === m ? ACCENT : "#7a8a9a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{m === "cash" ? "Cash" : m === "transfer" ? "Transfer" : "QRIS"}</button>))}</div>
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}><span style={{ fontSize: 20 }}>{pmIcon[selectedMethod]}</span><div><div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{pmLabel[selectedMethod]}</div><div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 3, lineHeight: 1.4 }}>{pmDesc[selectedMethod]}</div></div></div>
                    </div>
                  </>
                )}
                {paymentConfirmed && <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 16, padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}><div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div><div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a6a", marginBottom: 6 }}>Pembayaran Berhasil!</div><div style={{ fontSize: 12, color: "#4a9a7a" }}>Terima kasih telah menggunakan RIDE</div><div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center" }}><button onClick={() => setShowReviewModal(true)} style={{ padding: "10px 22px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f5a623,#e8950a)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>⭐ Beri Ulasan</button><button onClick={() => navigate("/dashboard/pengguna")} style={{ padding: "10px 22px", borderRadius: 12, border: "1.5px solid #e0e8f0", background: "#fff", color: "#1a2a3a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🏠 Beranda</button></div></div>}
              </div>
            </div>
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px 28px", background: "#fff", borderTop: "1px solid #e8f0f8", zIndex: 100 }}>
              {!paymentData && <button disabled style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#e0e8f0", color: "#9aa5b4", fontWeight: 700, fontSize: 15 }}>⏳ Menunggu data pembayaran...</button>}
              {paymentData && !paymentConfirmed && <button onClick={async () => { try { await fetch(`/api/pengguna/orders/${orderId}/confirm-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ paymentMethod: selectedMethod, voucherCode: voucherCode || null }) }); setPaymentConfirmed(true); } catch { alert("Gagal konfirmasi. Coba lagi."); } }} style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${ACCENT2}, ${ACCENT})`, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>✅ Konfirmasi Pembayaran</button>}
              {paymentConfirmed && <button disabled style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#a5d6a7", color: "#fff", fontWeight: 700, fontSize: 15 }}>✅ Pembayaran Selesai</button>}
            </div>
          </>
        );
      })()}
    {showReviewModal && <ReviewModal orderId={orderId} onClose={() => setShowReviewModal(false)} />}
    </div>
  );
}
