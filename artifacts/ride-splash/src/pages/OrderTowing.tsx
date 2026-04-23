import { useState, useRef, useEffect, useCallback } from "react";
import { calcBiayaPanggilan, calcEtaMinutes, calcEtaSecsLive } from "../utils/pricing";
import { useLocation } from "wouter";
import ReviewModal from "@/components/ReviewModal";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

const ACCENT = "#c97b00";
const ACCENT_DARK = "#7c4a00";

const STEPS = [
  { label: "Kendaraan", emoji: "🚛" },
  { label: "Lokasi", emoji: "📍" },
  { label: "Driver", emoji: "🚐" },
  { label: "Tracking", emoji: "📡" },
  { label: "Bayar", emoji: "💳" },
];

const JENIS_KENDARAAN = [
  { val: "motor",  emoji: "🏍️", label: "Motor" },
  { val: "mobil",  emoji: "🚗", label: "Mobil" },
  { val: "pickup", emoji: "🛻", label: "Pick Up" },
  { val: "truk",   emoji: "🚛", label: "Truk" },
];

const KONDISI_OPTIONS = [
  "Mogok Total", "Kecelakaan", "Ban Kempes", "Mesin Mati",
  "Transmisi Rusak", "Banjir/Terendam", "Aki Habis", "Lainnya",
];

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

function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
              <div style={{ width: 36, height: 36, borderRadius: 18, background: isActive ? "#fff" : isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)", border: isActive ? "none" : "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isActive ? 18 : 14 }}>
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

export default function OrderTowing() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // ── Step 1 ──
  const [jenisKendaraan, setJenisKendaraan] = useState("mobil");
  const [kondisi, setKondisi] = useState<string[]>([]);
  const [merekModel, setMerekModel] = useState("");
  const [bisaDinyalakan, setBisaDinyalakan] = useState<boolean | null>(null);

  const canNext1 = jenisKendaraan !== "" && kondisi.length > 0 && merekModel.trim() !== "" && bisaDinyalakan !== null;
  const toggleKondisi = (k: string) => setKondisi(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  // ── Step 2 ──
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [autoAddress, setAutoAddress] = useState("");
  const [detailAlamat, setDetailAlamat] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [tujuanDerek, setTujuanDerek] = useState("");

  const canNext2 = (pinLat !== null || userLat !== null) && tujuanDerek.trim() !== "";

  // ── Step 3 ──
  type AcceptedMitra = { id: number; name: string; lat: number; lng: number; serviceType: string; rating: number | null; totalOrders: number; dist: number; callFee: number; etaMin: number; };
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [orderStatus, setOrderStatus] = useState<"creating" | "pending" | "accepted" | "done" | "cancelled">("creating");
  const [acceptedMitra, setAcceptedMitra] = useState<AcceptedMitra | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
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

  // ── Step 4 ──
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

  // Identify socket as pengguna on mount
  useEffect(() => {
    fetch("/api/auth/me?role=pengguna", { credentials: "include" })
      .then(r => r.json()).then(me => { if (me.id) identifySocket(me.id, "pengguna"); }).catch(() => {});
    return () => { socket.disconnect(); };
  }, []);

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Resume
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (!resumeId) return;
    fetch(`/api/pengguna/orders/${resumeId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.status !== "accepted" || !data.mitra) return;
        const pLat: number = data.pickupLat ?? 0;
        const pLng: number = data.pickupLng ?? 0;
        const dist = haversineDist(data.mitra.lat, data.mitra.lng, pLat, pLng);
        setOrderId(data.id); setOrderNo(data.orderNo); setOrderStatus("accepted");
        setPinLat(pLat); setPinLng(pLng); setAutoAddress(data.pickupAddress || "");
        setMerekModel(data.vehicleModel || "");
        setAcceptedMitra({ id: data.mitra.id, name: data.mitra.name, lat: data.mitra.lat, lng: data.mitra.lng, serviceType: data.mitra.serviceType || "", rating: data.mitra.rating ?? null, totalOrders: data.mitra.totalOrders ?? 0, dist, callFee: data.totalAmount ?? 0, etaMin: Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60) });
        setMitraConfirmed(true);
        if (data.trackingPhase === "selesai") { if (data.paymentData) setPaymentData(data.paymentData); setStep(5); } else { setStep(4); }
      }).catch(() => {});
  }, []);

  // Map step 2
  useEffect(() => {
    if (step !== 2 || !mapRef.current || leafletMapRef.current) return;
    const lat = userLat ?? -1.2654, lng = userLng ?? 116.8312;
    const map = L.map(mapRef.current, { center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    if (userLat !== null && userLng !== null) {
      gpsMarkerRef.current = L.circleMarker([userLat, userLng], { radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3 }).addTo(map);
    }
    setPinLat(lat); setPinLng(lng);
    setIsGeocoding(true);
    reverseGeocode(lat, lng).then(addr => { setAutoAddress(addr); setIsGeocoding(false); });
    map.on("moveend", () => {
      const c = map.getCenter(); setPinLat(c.lat); setPinLng(c.lng); setIsGeocoding(true);
      reverseGeocode(c.lat, c.lng).then(addr => { setAutoAddress(addr); setIsGeocoding(false); });
    });
    leafletMapRef.current = map;
  }, [step, userLat, userLng]);

  useEffect(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    if (gpsMarkerRef.current) gpsMarkerRef.current.setLatLng([userLat, userLng]);
    else gpsMarkerRef.current = L.circleMarker([userLat, userLng], { radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3 }).addTo(leafletMapRef.current!);
  }, [userLat, userLng]);

  useEffect(() => {
    return () => {
      if (step === 2 && leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; gpsMarkerRef.current = null; }
    };
  }, [step]);

  function calcDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Create order
  useEffect(() => {
    if (step !== 3 || orderId) return;
    setOrderStatus("creating"); setAcceptedMitra(null); setCreateError(null);
    const descFull = [
      bisaDinyalakan ? "Kendaraan masih bisa dinyalakan" : "Kendaraan tidak bisa dinyalakan",
      `Tujuan derek: ${tujuanDerek}`,
    ].filter(Boolean).join(". ");
    (() => { const fd = new FormData(); fd.append("vehicleType", jenisKendaraan); fd.append("vehicleModel", merekModel); fd.append("vehicleYear", ""); fd.append("damageCategories", JSON.stringify(kondisi)); fd.append("description", descFull); fd.append("pickupAddress", autoAddress || "Lokasi yang dipilih"); fd.append("detailAlamat", detailAlamat); fd.append("pickupLat", String(pinLat ?? userLat ?? 0)); fd.append("pickupLng", String(pinLng ?? userLng ?? 0)); fd.append("serviceType", "towing"); if (foto) fd.append("foto", foto); return fetch("/api/pengguna/orders", { method: "POST", credentials: "include", body: fd }); })().then(r => r.json()).then(d => {
      if (!d.orderId) { setCreateError("Gagal membuat pesanan. Coba lagi."); return; }
      setOrderId(d.orderId); setOrderNo(d.orderNo); setOrderStatus("pending");
    }).catch(() => setCreateError("Koneksi gagal. Coba lagi."));
  }, [step, orderId]);

  // Poll order status + socket
  useEffect(() => {
    if (step !== 3 || !orderId || orderStatus !== "pending") return;
    const lat = pinLat ?? userLat ?? 0, lng = pinLng ?? userLng ?? 0;
    const applyOd = (od: any) => {
      if (od.status === "accepted" && od.mitra) {
        if (orderPollRef.current) clearInterval(orderPollRef.current);
        const mitraLat = od.mitra.lat ?? 0, mitraLng = od.mitra.lng ?? 0;
        const dist = calcDist(lat, lng, mitraLat, mitraLng);
        setAcceptedMitra({ id: od.mitra.id, name: od.mitra.name, lat: mitraLat, lng: mitraLng, serviceType: od.mitra.serviceType, rating: od.mitra.rating ?? null, totalOrders: od.mitra.totalOrders ?? 0, dist, callFee: od.totalAmount ?? calcBiayaPanggilan("towing", dist), etaMin: Math.ceil(calcEtaSecsLive(dist, od.mitra?.speedKmh) / 60) });
        setOrderStatus("accepted");
      } else if (od.status === "cancelled") {
        if (orderPollRef.current) clearInterval(orderPollRef.current);
        setOrderStatus("cancelled");
      }
    };
    const doPoll = async () => { try { const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" }); if (!res.ok) return; applyOd(await res.json()); } catch { } };
    const onAccepted = (data: any) => { if (data.orderId !== orderId) return; fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" }).then(r => r.json()).then(applyOd).catch(() => {}); };
    socket.on("order:accepted", onAccepted);
    doPoll();
    orderPollRef.current = setInterval(doPoll, 30000);
    return () => { if (orderPollRef.current) clearInterval(orderPollRef.current); socket.off("order:accepted", onAccepted); };
  }, [step, orderId, orderStatus, pinLat, pinLng, userLat, userLng]);

  // Chat
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !orderId || chatSending) return;
    setChatSending(true);
    try {
      const r = await fetch(`/api/chat/${orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: chatInput.trim() }) });
      if (r.status === 401) { alert("Sesi Anda telah habis. Silakan login ulang."); window.location.href = "/"; return; }
      setChatInput("");
    } catch { } finally { setChatSending(false); }
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

  // Step 4: location poll + socket for phase/payment/done
  useEffect(() => {
    if (step !== 4 || !orderId || !pinLat || !pinLng) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" });
        const data = await res.json();
        const mLat: number | null = data.mitra?.lat ?? null, mLng: number | null = data.mitra?.lng ?? null;
        if (mLat && mLng) { setMitraTrackLat(mLat); setMitraTrackLng(mLng); const dist = haversineDist(mLat, mLng, pinLat, pinLng); setTrackDist(dist); setTrackEta(Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60)); }
        if (data.trackingPhase) setTrackingPhase(data.trackingPhase);
        if (data.paymentData) setPaymentData(data.paymentData);
        if (data.trackingPhase === "selesai") setStep(5);
        if (data.status === "done") setOrderStatus("done");
      } catch { }
    };
    const onPhase = (data: any) => { if (data.orderId !== orderId) return; setTrackingPhase(data.phase); if (data.phase === "selesai") setStep(5); };
    const onPayment = (data: any) => { if (data.orderId !== orderId) return; setPaymentData(data.paymentData); };
    const onDone = (data: any) => { if (data.orderId !== orderId) return; setOrderStatus("done"); };
    socket.on("order:phase", onPhase); socket.on("order:payment", onPayment); socket.on("order:done", onDone);
    poll();
    trackingPollRef.current = setInterval(poll, 4000);
    return () => { if (trackingPollRef.current) clearInterval(trackingPollRef.current); socket.off("order:phase", onPhase); socket.off("order:payment", onPayment); socket.off("order:done", onDone); };
  }, [step, orderId, pinLat, pinLng]);

  // Step 5: socket + backup poll
  useEffect(() => {
    if (step !== 5 || !orderId) return;
    const onPayment = (data: any) => { if (data.orderId !== orderId) return; setPaymentData(data.paymentData); };
    const onDone = (data: any) => { if (data.orderId !== orderId) return; setOrderStatus("done"); };
    socket.on("order:payment", onPayment); socket.on("order:done", onDone);
    const poll = async () => { try { const res = await fetch(`/api/pengguna/orders/${orderId}?t=${Date.now()}`, { credentials: "include" }); if (!res.ok) return; const data = await res.json(); if (data.paymentData) setPaymentData(data.paymentData); if (data.status === "done") setOrderStatus("done"); } catch { } };
    poll();
    step5PollRef.current = setInterval(poll, 30000);
    return () => { if (step5PollRef.current) clearInterval(step5PollRef.current); socket.off("order:payment", onPayment); socket.off("order:done", onDone); };
  }, [step, orderId]);

  // Tracking map
  useEffect(() => {
    if (step !== 4 || !trackMapRef.current || !pinLat || !pinLng) return;
    if (!trackLeafletRef.current) {
      const map = L.map(trackMapRef.current, { zoomControl: false, attributionControl: false }).setView([mitraTrackLat ?? pinLat, mitraTrackLng ?? pinLng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const userIcon = L.divIcon({ html: '<div style="width:28px;height:28px;background:#e53e3e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">📍</div>', iconSize: [28, 28], iconAnchor: [14, 28], className: "" });
      trackUserMarkerRef.current = L.marker([pinLat, pinLng], { icon: userIcon }).addTo(map).bindPopup("Lokasi Kendaraan Anda");
      const mitraIcon = L.divIcon({ html: '<div style="width:36px;height:36px;background:#7c4a00;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;">🚐</div>', iconSize: [36, 36], iconAnchor: [18, 18], className: "" });
      if (mitraTrackLat && mitraTrackLng) {
        trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mitraIcon }).addTo(map).bindPopup("Driver Derek");
        map.fitBounds(L.latLngBounds([[pinLat, pinLng], [mitraTrackLat, mitraTrackLng]]), { padding: [40, 40] });
      }
      trackLeafletRef.current = map;
    } else if (mitraTrackLat && mitraTrackLng && trackMitraMarkerRef.current) {
      trackMitraMarkerRef.current.setLatLng([mitraTrackLat, mitraTrackLng]);
      if (pinLat && pinLng) trackLeafletRef.current!.fitBounds(L.latLngBounds([[pinLat, pinLng], [mitraTrackLat, mitraTrackLng]]), { padding: [40, 40] });
    }
  }, [step, pinLat, pinLng, mitraTrackLat, mitraTrackLng]);

  useEffect(() => {
    return () => {
      if (step === 4 && trackLeafletRef.current) { trackLeafletRef.current.remove(); trackLeafletRef.current = null; trackMitraMarkerRef.current = null; trackUserMarkerRef.current = null; }
    };
  }, [step]);

  const snapToGps = useCallback(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    leafletMapRef.current.setView([userLat, userLng], 16, { animate: true });
  }, [userLat, userLng]);

  const goToStep2 = () => {
    if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; gpsMarkerRef.current = null; }
    setStep(2);
  };

  const applyVoucher = async () => {
    if (!voucherCode || !paymentData) return;
    try {
      const r = await fetch(`/api/pengguna/vouchers/check?code=${encodeURIComponent(voucherCode)}&total=${paymentData.total}`, { credentials: "include" });
      const d = await r.json();
      const fmt = (n: number) => "Rp " + n.toLocaleString("id-ID");
      if (d.valid) { setVoucherDiscount(d.discount); setVoucherMsg(`✅ Diskon ${fmt(d.discount)}`); }
      else { setVoucherDiscount(0); setVoucherMsg(`❌ ${d.error}`); }
    } catch { setVoucherMsg("❌ Gagal cek voucher"); }
  };

  const computedTotal = paymentData
    ? Math.max(0, paymentData.total - voucherDiscount)
    : null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, #0d2137 0%, ${ACCENT_DARK} 60%, ${ACCENT} 100%)`, padding: "52px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {step !== 3 && (
            <button
              onClick={() => {
                if (step === 1) navigate("/dashboard/pengguna");
                else if (step === 2) setStep(1);
                else navigate("/dashboard/pengguna");
              }}
              style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}
            >&lt;-</button>
          )}
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>🚐 Towing / Derek</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Pesan layanan sekarang</div>
          </div>
        </div>
        <StepProgress step={step} />
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20 }}>🚛 Data Kendaraan</div>

              {/* Jenis Kendaraan — 2x2 grid */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Jenis Kendaraan</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {JENIS_KENDARAAN.map(({ val, emoji, label }) => (
                    <button
                      key={val}
                      onClick={() => setJenisKendaraan(val)}
                      style={{ padding: "14px 10px", borderRadius: 14, border: jenisKendaraan === val ? `2px solid ${ACCENT}` : "2px solid #e0e8f0", background: jenisKendaraan === val ? `rgba(201,123,0,0.09)` : "#f8fafc", color: jenisKendaraan === val ? ACCENT_DARK : "#7a8a9a", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      {emoji} {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kondisi Kendaraan */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Kondisi Kendaraan <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(boleh pilih lebih dari satu)</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {KONDISI_OPTIONS.map(k => (
                    <button
                      key={k}
                      onClick={() => toggleKondisi(k)}
                      style={{ padding: "9px 16px", borderRadius: 20, border: kondisi.includes(k) ? `2px solid ${ACCENT}` : "1.5px solid #d0dce8", background: kondisi.includes(k) ? `rgba(201,123,0,0.08)` : "#f8fafc", color: kondisi.includes(k) ? ACCENT_DARK : "#4a5568", fontWeight: kondisi.includes(k) ? 700 : 500, fontSize: 13, cursor: "pointer" }}
                    >
                      {k}
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
                  placeholder="Contoh: Honda Beat, Toyota Avanza"
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none" }}
                />
              </div>

              {/* Toggle: bisa dinyalakan? */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Kendaraan masih bisa dinyalakan?</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {([true, false] as const).map(val => (
                    <button
                      key={String(val)}
                      onClick={() => setBisaDinyalakan(val)}
                      style={{ flex: 1, padding: "14px", borderRadius: 14, border: bisaDinyalakan === val ? `2px solid ${val ? "#1a7a6a" : "#c0392b"}` : "2px solid #e0e8f0", background: bisaDinyalakan === val ? (val ? "rgba(26,122,106,0.09)" : "rgba(192,57,43,0.09)") : "#f8fafc", color: bisaDinyalakan === val ? (val ? "#1a7a6a" : "#c0392b") : "#7a8a9a", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      {val ? "✅ Ya" : "❌ Tidak"}
                    </button>
                  ))}
                </div>
                {bisaDinyalakan !== null && (
                  <div style={{ marginTop: 10, padding: "10px 14px", background: bisaDinyalakan ? "rgba(26,122,106,0.07)" : "rgba(234,88,12,0.07)", borderRadius: 12, fontSize: 12, color: bisaDinyalakan ? "#1a7a6a" : "#ea580c", fontWeight: 600 }}>
                    {bisaDinyalakan
                      ? "ℹ️ Kendaraan dapat dikendarai ke pinggir jalan untuk memudahkan proses derek."
                      : "⚠️ Driver derek akan membawa alat khusus untuk kendaraan yang tidak bisa dinyalakan."}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Foto Kendaraan <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span></label>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 12px", borderRadius: 14, border: foto ? "2px solid #1a7a6a" : "1.5px dashed #b0c4d8", background: foto ? "rgba(26,122,106,0.05)" : "#f8fafc", cursor: "pointer" }}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => setFoto(e.target.files?.[0] ?? null)} />
                  {foto ? (<><span style={{ fontSize: 28 }}>✅</span><span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>{foto.name}</span><span style={{ fontSize: 11, color: "#9aa5b4" }}>Tap untuk ganti</span></>) : (<><span style={{ fontSize: 28 }}>📸</span><span style={{ fontSize: 13, color: "#7a8a9a" }}>Tap untuk upload foto</span></>)}
                </label>
              </div>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
            <button
              disabled={!canNext1}
              onClick={goToStep2}
              style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: canNext1 ? `linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT} 100%)` : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext1 ? "pointer" : "not-allowed" }}
            >
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 2 ── Lokasi Kendaraan + Tujuan Derek */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 14px" }}>

              {/* A — Lokasi Kendaraan */}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 4 }}>📍 Lokasi Kendaraan</div>
              <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 14 }}>Geser peta ke posisi kendaraan yang bermasalah</div>

              {/* Map */}
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 12, height: 220 }}>
                <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", marginBottom: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2a3a", whiteSpace: "nowrap" }}>
                      {isGeocoding ? "Memuat..." : "Lokasi Kendaraan"}
                    </div>
                    {!isGeocoding && <div style={{ fontSize: 10, color: "#7a8a9a", whiteSpace: "nowrap" }}>Geser untuk sesuaikan</div>}
                  </div>
                  <span style={{ fontSize: 32, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>🚗</span>
                </div>
                <button
                  onClick={snapToGps}
                  style={{ position: "absolute", bottom: 12, right: 12, zIndex: 1000, width: 42, height: 42, borderRadius: 12, background: "#fff", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}
                >
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#1a3a5c", letterSpacing: 0.5 }}>GPS</span>
                </button>
              </div>

              {autoAddress && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: `rgba(201,123,0,0.07)`, borderRadius: 12, marginBottom: 14, border: `1px solid rgba(201,123,0,0.25)` }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span>
                  <span style={{ fontSize: 13, color: "#1a2a3a", lineHeight: 1.4 }}>{autoAddress}</span>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Detail Lokasi</label>
                <textarea
                  value={detailAlamat}
                  onChange={e => setDetailAlamat(e.target.value)}
                  placeholder="Depan SPBU, dekat lampu merah..."
                  rows={2}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 14, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }}
                />
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: "#e8ecf0" }} />
                <div style={{ fontSize: 12, color: "#9aa5b4", fontWeight: 600, whiteSpace: "nowrap" }}>⬇️ Mau dibawa ke mana?</div>
                <div style={{ flex: 1, height: 1, background: "#e8ecf0" }} />
              </div>

              {/* B — Tujuan Derek */}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>🏁 Tujuan Derek</div>
              <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 12 }}>Bengkel tujuan, alamat rumah, atau lokasi lain</div>

              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={tujuanDerek}
                  onChange={e => setTujuanDerek(e.target.value)}
                  placeholder="Contoh: Bengkel Pak Budi, Jl. Gatot Subroto No.12"
                  rows={3}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: tujuanDerek.trim() ? `1.5px solid ${ACCENT}` : "1.5px solid #e0e8f0", fontSize: 14, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.6 }}
                />
              </div>

              {/* Info biaya derek */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "rgba(201,123,0,0.07)", borderRadius: 14, border: "1px solid rgba(201,123,0,0.2)" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT_DARK }}>Tarif derek dihitung berdasarkan jarak</div>
                  <div style={{ fontSize: 11, color: "#7a8a9a", marginTop: 3, lineHeight: 1.5 }}>Driver akan konfirmasi estimasi biaya total via chat sebelum mulai menderek.</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100, display: "flex", gap: 12 }}>
            <button
              onClick={() => setStep(1)}
              style={{ flex: 1, padding: "17px", borderRadius: 16, border: `1.5px solid ${ACCENT_DARK}`, background: "#fff", color: ACCENT_DARK, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              ← Kembali
            </button>
            <button
              disabled={!canNext2}
              onClick={() => {
                if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; gpsMarkerRef.current = null; }
                setStep(3);
              }}
              style={{ flex: 2, padding: "17px", borderRadius: 16, border: "none", background: canNext2 ? `linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT} 100%)` : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext2 ? "pointer" : "not-allowed" }}
            >
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3 — Cari Driver Derek ── */}
      {step === 3 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 24 }}>🚐 Cari Driver Derek</div>

              {(orderStatus === "creating" || createError) && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0 24px" }}>
                  {createError ? (
                    <>
                      <span style={{ fontSize: 48 }}>⚠️</span>
                      <div style={{ fontSize: 14, color: "#ea580c", fontWeight: 600, textAlign: "center" }}>{createError}</div>
                      <button onClick={() => navigate("/dashboard/pengguna")} style={{ padding: "12px 32px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
                    </>
                  ) : (
                    <>
                      <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div className="search-pulse" />
                        <div className="search-spinner" />
                      </div>
                      <div style={{ fontSize: 14, color: "#7a8a9a" }}>Membuat pesanan...</div>
                    </>
                  )}
                </div>
              )}

              {orderStatus === "pending" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 0 16px" }}>
                  <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="search-pulse" />
                    <div className="search-spinner" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Mencari Driver Derek Terdekat...</div>
                    <div style={{ fontSize: 13, color: "#7a8a9a", lineHeight: 1.5 }}>Menghubungi driver di sekitar lokasi Anda. Harap tunggu.</div>
                  </div>
                  {orderNo && <div style={{ fontSize: 12, color: "#9aa5b4", fontWeight: 600 }}>No. Pesanan: {orderNo}</div>}
                  <button
                    onClick={async () => {
                      if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" });
                      if (orderPollRef.current) clearInterval(orderPollRef.current);
                      navigate("/dashboard/pengguna");
                    }}
                    style={{ marginTop: 8, padding: "12px 32px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                  >✕ Batalkan</button>
                </div>
              )}

              {orderStatus === "accepted" && acceptedMitra && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#fef7e9", borderRadius: 14, border: `1.5px solid rgba(201,123,0,0.35)` }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT_DARK }}>Driver Derek Ditemukan!</div>
                  </div>

                  <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 18, padding: "18px 16px", background: "#fff" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fef3e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>🚐</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a", marginBottom: 3 }}>{acceptedMitra.name}</div>
                        <div style={{ fontSize: 13, color: "#f5a623", fontWeight: 700, marginBottom: 3 }}>⭐ {acceptedMitra.rating ?? "–"}{acceptedMitra.totalOrders > 0 ? ` · ${acceptedMitra.totalOrders} order` : ""}</div>
                        <div style={{ fontSize: 12, color: "#4a5568" }}>{acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist * 1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`} · Est. {acceptedMitra.etaMin} menit</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", marginBottom: 14, borderTop: "1px solid #f0f4f8", paddingTop: 14 }}>
                      <div style={{ flex: 1, paddingRight: 14 }}>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Biaya Panggilan</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>Rp {acceptedMitra.callFee.toLocaleString("id-ID")}</div>
                      </div>
                      <div style={{ width: 1, background: "#e0e8f0", margin: "0 14px 0 0" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Est. Tiba</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>± {acceptedMitra.etaMin} menit</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "rgba(201,123,0,0.07)", borderRadius: 12, border: "1px solid rgba(201,123,0,0.2)" }}>
                      <span style={{ fontSize: 15 }}>💡</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT_DARK }}>Konfirmasi tujuan derek & estimasi biaya</div>
                        <div style={{ fontSize: 11, color: "#7a8a9a", marginTop: 1 }}>Chat dengan driver untuk memastikan tarif sebelum berangkat</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setChatOpen(o => !o)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px", borderRadius: 14, border: "none", background: chatOpen ? ACCENT_DARK : `linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT} 100%)`, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 17 }}>💬</span> Chat & Konfirmasi {chatOpen ? "∧" : "∨"}
                  </button>

                  {chatOpen && (
                    <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div>
                      </div>
                      <div style={{ minHeight: 160, maxHeight: 220, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                        {chatMessages.length === 0 ? (
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0" }}>
                            <span style={{ fontSize: 32, opacity: 0.3 }}>💬</span>
                            <div style={{ fontSize: 12, color: "#b0bec5", textAlign: "center" }}>Mulai diskusi dengan driver</div>
                          </div>
                        ) : (
                          chatMessages.map(m => {
                            const isMine = m.senderRole === "pengguna";
                            return (
                              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
                                <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                                  {m.message}
                                </div>
                                <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            );
                          })
                        )}
                        <div ref={chatBottomRef} />
                      </div>
                      <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                        <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChatMessage()} placeholder="Ketik pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }} />
                        <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})` : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => { if (orderId) await fetch(`/api/pengguna/orders/${orderId}/confirm`, { method: "PATCH", credentials: "include" }).catch(() => {}); setMitraConfirmed(true); setChatOpen(false); setStep(4); }}
                    disabled={mitraConfirmed}
                    style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: mitraConfirmed ? "#a5d6a7" : "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: mitraConfirmed ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {mitraConfirmed ? "✅ Driver Dikonfirmasi" : "✅ Setuju & Panggil Driver"}
                  </button>

                  {!mitraConfirmed && (
                    <button
                      onClick={async () => {
                        if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {});
                        if (orderPollRef.current) clearInterval(orderPollRef.current);
                        if (chatPollRef.current) clearInterval(chatPollRef.current);
                        setOrderId(null); setOrderNo(""); setOrderStatus("creating");
                        setAcceptedMitra(null); setChatMessages([]); setChatInput(""); setChatOpen(false); setMitraConfirmed(false);
                        
                      }}
                      style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >🔄 Cari Driver Lain</button>
                  )}
                </div>
              )}

              {orderStatus === "cancelled" && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <span style={{ fontSize: 52 }}>😔</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginTop: 12 }}>Pesanan Dibatalkan</div>
                  <button onClick={() => navigate("/dashboard/pengguna")} style={{ marginTop: 16, padding: "12px 32px", borderRadius: 14, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
                </div>
              )}
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 20px 20px", background: "linear-gradient(to top, #f0f4f8 90%, transparent)", zIndex: 100 }}>
            {orderStatus === "accepted" && !mitraConfirmed ? (
              <button
                onClick={async () => {
                  if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {});
                  if (orderPollRef.current) clearInterval(orderPollRef.current);
                  if (chatPollRef.current) clearInterval(chatPollRef.current);
                  navigate("/dashboard/pengguna");
                }}
                style={{ width: "100%", padding: "15px", borderRadius: 16, border: "1.5px solid #e8a0a0", background: "#fff5f5", color: "#c0392b", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >✕ Batalkan Pesanan</button>
            ) : (
              <div style={{ height: 10 }} />
            )}
          </div>
        </>
      )}

      {/* ── STEP 4 — Tracking ── */}
      {step === 4 && (
        <>
          {orderStatus === "cancelled" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center" }}>
              <span style={{ fontSize: 56 }}>😔</span>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", marginTop: 14 }}>Pesanan Dibatalkan</div>
              <div style={{ fontSize: 13, color: "#7a8a9a", marginTop: 6 }}>Mitra membatalkan pesanan ini. Silakan pesan kembali.</div>
              <button onClick={() => navigate("/dashboard/pengguna")} style={{ marginTop: 20, padding: "13px 36px", borderRadius: 14, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali ke Beranda</button>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px", display: orderStatus === "cancelled" ? "none" : undefined }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 4 }}>📡 Tracking Driver Derek</div>

              {/* Phase bar */}
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {(["menuju", "tiba", "pengerjaan", "selesai"] as const).map((ph, i) => {
                  const labels: Record<string, string> = { menuju: "Menuju", tiba: "Tiba", pengerjaan: "Menderek", selesai: "Selesai" };
                  const idx = ["menuju", "tiba", "pengerjaan", "selesai"].indexOf(trackingPhase);
                  const isDone = i <= idx;
                  return (
                    <div key={ph} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: "100%", height: 5, borderRadius: 4, background: isDone ? ACCENT : "#e0e8f0" }} />
                      <div style={{ fontSize: 9, color: isDone ? ACCENT_DARK : "#b0bec5", fontWeight: isDone ? 700 : 400 }}>{labels[ph]}</div>
                    </div>
                  );
                })}
              </div>

              {/* Map */}
              <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16, height: 220 }}>
                <div ref={trackMapRef} style={{ width: "100%", height: "100%" }} />
              </div>

              {/* Distance / ETA */}
              {trackDist !== null && (
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, padding: "12px 16px", background: `rgba(201,123,0,0.07)`, borderRadius: 14, border: `1px solid rgba(201,123,0,0.18)`, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#9aa5b4" }}>Jarak Driver</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT_DARK }}>{trackDist < 1 ? `${Math.round(trackDist * 1000)} m` : `${trackDist.toFixed(1)} km`}</div>
                  </div>
                  <div style={{ flex: 1, padding: "12px 16px", background: `rgba(201,123,0,0.07)`, borderRadius: 14, border: `1px solid rgba(201,123,0,0.18)`, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#9aa5b4" }}>Est. Tiba</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT_DARK }}>± {trackEta} mnt</div>
                  </div>
                </div>
              )}

              {/* Phase info */}
              {trackingPhase === "menuju" && (
                <div style={{ padding: "14px 18px", background: "rgba(201,123,0,0.07)", borderRadius: 14, border: "1px solid rgba(201,123,0,0.18)", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT_DARK }}>🚐 Driver Sedang Menuju Lokasi</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 4 }}>Harap siapkan kendaraan dan pastikan Anda berada di lokasi.</div>
                </div>
              )}
              {trackingPhase === "tiba" && (
                <div style={{ padding: "14px 18px", background: "rgba(26,122,106,0.08)", borderRadius: 14, border: "1px solid rgba(26,122,106,0.25)", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a7a6a" }}>✅ Driver Telah Tiba!</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 4 }}>Driver sedang dalam proses persiapan derek kendaraan Anda.</div>
                </div>
              )}
              {trackingPhase === "pengerjaan" && (
                <div style={{ padding: "14px 18px", background: "rgba(201,123,0,0.07)", borderRadius: 14, border: "1px solid rgba(201,123,0,0.2)", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT_DARK }}>🔗 Sedang Menderek Kendaraan...</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 4 }}>Kendaraan Anda sedang dalam proses derek ke tujuan.</div>
                </div>
              )}

              {/* Chat */}
              <button
                onClick={() => setChatOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 12 }}
              >
                <span>💬</span> Chat dengan Driver {chatOpen ? "∧" : "∨"}
              </button>

              {chatOpen && acceptedMitra && (
                <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div>
                  </div>
                  <div style={{ minHeight: 140, maxHeight: 200, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                        <span style={{ fontSize: 32, opacity: 0.3 }}>💬</span>
                        <div style={{ fontSize: 12, color: "#b0bec5", marginTop: 8 }}>Belum ada pesan</div>
                      </div>
                    ) : (
                      chatMessages.map(m => {
                        const isMine = m.senderRole === "pengguna";
                        return (
                          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
                            <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                              {m.message}
                            </div>
                            <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChatMessage()} placeholder="Ketik pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }} />
                    <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})` : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 20px 20px", background: "linear-gradient(to top, #f0f4f8 90%, transparent)", zIndex: 100 }}>
            <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center", fontWeight: 600, padding: "6px 0 8px" }}>
              {trackingPhase === "selesai" ? "✅ Proses derek selesai — menuju pembayaran..." : "Tunggu driver menyelesaikan proses derek..."}
            </div>
          </div>
        </>
      )}

      {/* ── STEP 5 — Bayar ── */}
      {step === 5 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 120px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20 }}>💳 Pembayaran</div>

              {!paymentData ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
                  <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="search-pulse" />
                    <div className="search-spinner" />
                  </div>
                  <div style={{ fontSize: 14, color: "#7a8a9a", textAlign: "center" }}>Menunggu driver menginput rincian biaya...</div>
                </div>
              ) : (
                <>
                  {/* Rincian biaya */}
                  <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
                    <div style={{ padding: "12px 16px", background: `rgba(201,123,0,0.07)`, borderBottom: "1px solid #f0f4f8" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT_DARK }}>🧾 Rincian Biaya</div>
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        ["Biaya Jasa Derek", paymentData.biayaJasa],
                        ["Biaya Sparepart", paymentData.biayaSparepart],
                        ["Biaya Panggilan", paymentData.biayaPanggilan],
                        ["Biaya Layanan", paymentData.biayaLayanan],
                      ].map(([label, val]) => (
                        <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4a5568" }}>
                          <span>{label}</span>
                          <span style={{ fontWeight: 600, color: "#1a2a3a" }}>Rp {(val as number).toLocaleString("id-ID")}</span>
                        </div>
                      ))}
                      {voucherDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#16a34a" }}>
                          <span>Diskon Voucher ({voucherCode.toUpperCase()})</span>
                          <span style={{ fontWeight: 700 }}>- Rp {voucherDiscount.toLocaleString("id-ID")}</span>
                        </div>
                      )}
                      <div style={{ borderTop: "1.5px solid #e0e8f0", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
                        <span>Total</span>
                        <span style={{ color: ACCENT_DARK }}>Rp {(computedTotal ?? 0).toLocaleString("id-ID")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Voucher */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Kode Voucher</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherDiscount(0); setVoucherMsg(""); }}
                        placeholder="Contoh: RIDE10"
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", background: "#f8fafc" }}
                      />
                      <button
                        onClick={applyVoucher}
                        style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >Pakai</button>
                    </div>
                    {voucherMsg && <div style={{ fontSize: 12, color: voucherMsg.startsWith("✅") ? "#16a34a" : "#dc2626", fontWeight: 700, marginTop: 6 }}>{voucherMsg}</div>}
                  </div>

                  {/* Metode bayar */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 10 }}>Metode Pembayaran</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {(["cash", "transfer", "qris"] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setPaymentMethodUser(m)}
                          style={{ flex: 1, padding: "12px 8px", borderRadius: 14, border: paymentMethodUser === m ? `2px solid ${ACCENT}` : "1.5px solid #e0e8f0", background: paymentMethodUser === m ? `rgba(201,123,0,0.08)` : "#f8fafc", color: paymentMethodUser === m ? ACCENT_DARK : "#7a8a9a", fontWeight: paymentMethodUser === m ? 700 : 500, fontSize: 13, cursor: "pointer" }}
                        >
                          {m === "cash" ? "💵 Cash" : m === "transfer" ? "🏦 Transfer" : "📱 QRIS"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentConfirmed || orderStatus === "done" ? (
                    <div style={{ padding: "20px", background: "rgba(22,163,74,0.08)", borderRadius: 16, border: "1.5px solid rgba(22,163,74,0.3)", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>Pembayaran Dikonfirmasi!</div>
                      <div style={{ fontSize: 13, color: "#7a8a9a", marginTop: 6 }}>Terima kasih telah menggunakan RIDE</div>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/pengguna/orders/${orderId}/confirm-payment`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ paymentMethod: paymentMethodUser }),
                          });
                          setPaymentConfirmed(true);
                        } catch { setPaymentConfirmed(true); }
                      }}
                      style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT} 100%)`, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
                    >
                      ✅ Konfirmasi Pembayaran
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {(paymentConfirmed || orderStatus === "done") && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px 28px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
              <button
                onClick={() => setShowReviewModal(true)}
                style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
              >
                ⭐ Beri Ulasan Driver
              </button>
            </div>
          )}
        </>
      )}
    {showReviewModal && <ReviewModal orderId={orderId} onClose={() => setShowReviewModal(false)} />}
    </div>
  );
}
