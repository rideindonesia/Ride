import { useState, useRef, useEffect, useCallback } from "react";
import { calcBiayaPanggilan, calcEtaMinutes, calcEtaSecsLive } from "../utils/pricing";
import { useLocation } from "wouter";
import ReviewModal from "@/components/ReviewModal";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";

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

function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  // Step 3 — order lifecycle
  type AcceptedMitra = {
    id: number; name: string; lat: number; lng: number; serviceType: string;
    rating: number | null; totalOrders: number; dist: number; callFee: number; etaMin: number;
  };
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [orderStatus, setOrderStatus] = useState<"creating" | "pending" | "accepted" | "done" | "cancelled">("creating");
  const [acceptedMitra, setAcceptedMitra] = useState<AcceptedMitra | null>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const orderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat state
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

  // Step 4 tracking
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
  const [paymentMethodUser, setPaymentMethodUser] = useState<"cash"|"transfer"|"qris">("cash");
  const trackMapRef = useRef<HTMLDivElement>(null);
  const trackLeafletRef = useRef<L.Map | null>(null);
  const trackMitraMarkerRef = useRef<L.Marker | null>(null);
  const trackUserMarkerRef = useRef<L.Marker | null>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const categories = jenisKendaraan === "mobil" ? KATEGORI_MOBIL : KATEGORI_MOTOR;
  const canNext1 = merekModel.trim() && tahun && kategori.length > 0;

  const handleJenisChange = (jenis: "mobil" | "motor") => {
    setJenisKendaraan(jenis);
    setKategori([]);
  };

  const toggleKategori = (k: string) => {
    setKategori(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  // Identify socket as pengguna on mount
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(me => { if (me.id) identifySocket(me.id, "pengguna"); })
      .catch(() => {});
    return () => { socket.disconnect(); };
  }, []);

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

  // Resume active order from URL param (?resume=orderId)
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
        const etaMin = Math.ceil(calcEtaSecsLive(dist, data.mitra.speedKmh) / 60);
        setOrderId(data.id);
        setOrderNo(data.orderNo);
        setOrderStatus("accepted");
        setPinLat(pLat);
        setPinLng(pLng);
        setAutoAddress(data.pickupAddress || "");
        setMerekModel(data.vehicleModel || "");
        setAcceptedMitra({
          id: data.mitra.id,
          name: data.mitra.name,
          lat: data.mitra.lat,
          lng: data.mitra.lng,
          serviceType: data.mitra.serviceType || "",
          rating: data.mitra.rating ?? null,
          totalOrders: data.mitra.totalOrders ?? 0,
          dist,
          callFee: data.totalAmount ?? 0,
          etaMin,
        });
        setMitraConfirmed(true);
        if (data.trackingPhase === "selesai") {
          if (data.paymentData) setPaymentData(data.paymentData);
          setStep(5);
        } else {
          setStep(4);
        }
      })
      .catch(() => {});
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

  // Haversine distance (km)
  function calcDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Step 3 — Phase 1: create order (only when entering step 3 fresh, orderId not yet set)
  useEffect(() => {
    if (step !== 3) return;
    if (orderId) return; // already created, just waiting for acceptance

    setOrderStatus("creating");
    setAcceptedMitra(null);
    setCreateError(null);

    const address = autoAddress || "Lokasi yang dipilih";
    const lat = pinLat ?? userLat ?? 0;
    const lng = pinLng ?? userLng ?? 0;

    fetch("/api/pengguna/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        vehicleType: jenisKendaraan,
        vehicleModel: merekModel,
        vehicleYear: tahun,
        damageCategories: kategori,
        description: deskripsi,
        pickupAddress: address,
        detailAlamat,
        pickupLat: lat,
        pickupLng: lng,
        serviceType: "bengkel",
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.orderId) { setCreateError("Gagal membuat pesanan. Coba lagi."); return; }
        setOrderId(d.orderId);
        setOrderNo(d.orderNo);
        setOrderStatus("pending");
      })
      .catch(() => setCreateError("Koneksi gagal. Coba lagi."));
  }, [step, orderId]);

  // Step 3 — Phase 2: socket + backup polling for order status when pending
  useEffect(() => {
    if (step !== 3 || !orderId || orderStatus !== "pending") return;

    const lat = pinLat ?? userLat ?? 0;
    const lng = pinLng ?? userLng ?? 0;

    const applyOrderData = (od: any) => {
      if (od.status === "accepted" && od.mitra) {
        const mitraLat = od.mitra.lat ?? 0;
        const mitraLng = od.mitra.lng ?? 0;
        const dist = calcDist(lat, lng, mitraLat, mitraLng);
        const callFee = od.totalAmount ?? calcBiayaPanggilan("bengkel", dist);
        const etaMin = Math.ceil(calcEtaSecsLive(dist, od.mitra.speedKmh) / 60);
        setAcceptedMitra({
          id: od.mitra.id,
          name: od.mitra.name,
          lat: mitraLat,
          lng: mitraLng,
          serviceType: od.mitra.serviceType,
          rating: od.mitra.rating,
          totalOrders: od.mitra.totalOrders,
          dist,
          callFee,
          etaMin,
        });
        setOrderStatus("accepted");
      } else if (od.status === "cancelled") {
        setOrderStatus("cancelled");
      } else if (od.status === "done") {
        setOrderStatus("done");
        setOrderTotal(od.totalAmount);
      }
    };

    const doPoll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" });
        if (!res.ok) return;
        applyOrderData(await res.json());
      } catch { /* ignore */ }
    };

    // Socket listener: instant notification when mitra accepts
    const onAccepted = (data: any) => {
      if (data.orderId !== orderId) return;
      fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" })
        .then(r => r.json()).then(applyOrderData).catch(() => {});
    };
    socket.on("order:accepted", onAccepted);

    doPoll(); // immediate first check
    orderPollRef.current = setInterval(doPoll, 30000); // 30s backup
    return () => {
      if (orderPollRef.current) clearInterval(orderPollRef.current);
      socket.off("order:accepted", onAccepted);
    };
  }, [step, orderId, orderStatus]);

  // Real-time chat via socket when order accepted
  useEffect(() => {
    if (orderStatus !== "accepted" || !orderId) return;

    // Initial fetch
    fetch(`/api/chat/${orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setChatMessages(data.messages ?? []);
        setTimeout(() => {
          const el = chatBottomRef.current?.parentElement;
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      }).catch(() => {});

    // Join order socket room for real-time chat
    joinOrderRoom(orderId);

    const onChat = (data: any) => {
      if (data.orderId !== orderId) return;
      setChatMessages(prev => {
        if (prev.some((m: any) => m.id === data.id)) return prev;
        const next = [...prev, data];
        setTimeout(() => {
          const el = chatBottomRef.current?.parentElement;
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
        return next;
      });
    };
    socket.on("chat:message", onChat);

    return () => {
      leaveOrderRoom(orderId);
      socket.off("chat:message", onChat);
    };
  }, [orderStatus, orderId]);

  // Step 4: poll mitra location + socket for phase/payment/done
  useEffect(() => {
    if (step !== 4 || !orderId || !pinLat || !pinLng) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" });
        const data = await res.json();
        const mLat: number | null = data.mitra?.lat ?? null;
        const mLng: number | null = data.mitra?.lng ?? null;
        if (mLat && mLng) {
          setMitraTrackLat(mLat);
          setMitraTrackLng(mLng);
          const dist = haversineDist(mLat, mLng, pinLat, pinLng);
          setTrackDist(dist);
          // Blend kecepatan GPS nyata mitra dengan model lalu lintas
          setTrackEta(Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60));
        }
        if (data.trackingPhase) setTrackingPhase(data.trackingPhase);
        if (data.paymentData) setPaymentData(data.paymentData);
        if (data.trackingPhase === "selesai") setStep(5);
        if (data.status === "done") { setOrderStatus("done"); setOrderTotal(data.totalAmount); }
      } catch { /* ignore */ }
    };

    // Socket: instant phase/payment/done updates
    const onPhase = (data: any) => {
      if (data.orderId !== orderId) return;
      setTrackingPhase(data.phase);
      if (data.phase === "selesai") setStep(5);
    };
    const onPayment = (data: any) => {
      if (data.orderId !== orderId) return;
      setPaymentData(data.paymentData);
    };
    const onDone = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrderStatus("done");
      if (data.totalAmount) setOrderTotal(data.totalAmount);
    };
    socket.on("order:phase", onPhase);
    socket.on("order:payment", onPayment);
    socket.on("order:done", onDone);

    poll();
    trackingPollRef.current = setInterval(poll, 4000); // keep for location updates
    return () => {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
      socket.off("order:phase", onPhase);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
    };
  }, [step, orderId, pinLat, pinLng]);

  // Step 5: socket for payment/done + backup poll
  const step5PollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step !== 5 || !orderId) return;

    const onPayment = (data: any) => {
      if (data.orderId !== orderId) return;
      setPaymentData(data.paymentData);
    };
    const onDone = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrderStatus("done");
      if (data.totalAmount) setOrderTotal(data.totalAmount);
    };
    socket.on("order:payment", onPayment);
    socket.on("order:done", onDone);

    const poll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}?t=${Date.now()}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.paymentData) setPaymentData(data.paymentData);
        if (data.status === "done") { setOrderStatus("done"); setOrderTotal(data.totalAmount); }
      } catch { /* ignore */ }
    };
    poll();
    step5PollRef.current = setInterval(poll, 30000); // 30s backup
    return () => {
      if (step5PollRef.current) clearInterval(step5PollRef.current);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
    };
  }, [step, orderId]);

  // Step 4: init & update tracking Leaflet map
  useEffect(() => {
    if (step !== 4 || !trackMapRef.current || !pinLat || !pinLng) return;
    if (!trackLeafletRef.current) {
      const centerLat = mitraTrackLat ?? pinLat;
      const centerLng = mitraTrackLng ?? pinLng;
      const map = L.map(trackMapRef.current, { zoomControl: false, attributionControl: false })
        .setView([centerLat, centerLng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      // User marker
      const userIcon = L.divIcon({ html: '<div style="width:28px;height:28px;background:#e53e3e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">📍</div>', iconSize: [28, 28], iconAnchor: [14, 28], className: "" });
      trackUserMarkerRef.current = L.marker([pinLat, pinLng], { icon: userIcon }).addTo(map).bindPopup("Lokasi Anda");
      // Mitra marker
      const mitraIcon = L.divIcon({ html: '<div style="width:34px;height:34px;background:#1a3a5c;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">🏍️</div>', iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
      if (mitraTrackLat && mitraTrackLng) {
        trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mitraIcon }).addTo(map).bindPopup("Mitra");
        const bounds = L.latLngBounds([[pinLat, pinLng], [mitraTrackLat, mitraTrackLng]]);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
      trackLeafletRef.current = map;
    } else if (mitraTrackLat && mitraTrackLng && trackMitraMarkerRef.current) {
      trackMitraMarkerRef.current.setLatLng([mitraTrackLat, mitraTrackLng]);
      if (pinLat && pinLng) {
        const bounds = L.latLngBounds([[pinLat, pinLng], [mitraTrackLat, mitraTrackLng]]);
        trackLeafletRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    } else if (mitraTrackLat && mitraTrackLng && trackLeafletRef.current) {
      const mitraIcon = L.divIcon({ html: '<div style="width:34px;height:34px;background:#1a3a5c;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">🏍️</div>', iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
      trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mitraIcon }).addTo(trackLeafletRef.current).bindPopup("Mitra");
      const bounds = L.latLngBounds([[pinLat, pinLng], [mitraTrackLat, mitraTrackLng]]);
      trackLeafletRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [step, mitraTrackLat, mitraTrackLng, pinLat, pinLng]);

  // Cleanup tracking map on step change
  useEffect(() => {
    if (step !== 4 && trackLeafletRef.current) {
      trackLeafletRef.current.remove();
      trackLeafletRef.current = null;
      trackMitraMarkerRef.current = null;
      trackUserMarkerRef.current = null;
    }
    if (step !== 4 && trackingPollRef.current) {
      clearInterval(trackingPollRef.current);
      trackingPollRef.current = null;
    }
  }, [step]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !orderId || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const r = await fetch(`/api/chat/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      });
      if (r.status === 401) {
        alert("Sesi Anda telah habis. Silakan login ulang.");
        window.location.href = "/";
        return;
      }
    } catch { /* ignore */ } finally {
      setChatSending(false);
    }
  };

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
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {step !== 3 && (
            <button
              onClick={() => {
                if (step === 1) { navigate("/dashboard/pengguna"); return; }
                if (step === 2) { setStep(1); return; }
                navigate("/dashboard/pengguna");
              }}
              style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}
            >&lt;-</button>
          )}
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
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
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

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
            <button disabled={!canNext1} onClick={goToStep2} style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: canNext1 ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext1 ? "pointer" : "not-allowed" }}>
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 14px" }}>
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

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100, display: "flex", gap: 12 }}>
            <button
              onClick={() => setStep(1)}
              style={{ flex: 1, padding: "17px", borderRadius: 16, border: "1.5px solid #1a3a5c", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              ← Kembali
            </button>
            <button
              onClick={() => {
                if (leafletMapRef.current) {
                  leafletMapRef.current.remove();
                  leafletMapRef.current = null;
                  gpsMarkerRef.current = null;
                }
                setStep(3);
              }}
              style={{ flex: 2, padding: "17px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              Lanjut →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 24 }}>🔧 Cari Mitra</div>

              {/* Creating / error */}
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

              {/* Pending — waiting for mitra to accept */}
              {orderStatus === "pending" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 0 16px" }}>
                  <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="search-pulse" />
                    <div className="search-spinner" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Mencari Mitra Terdekat...</div>
                    <div style={{ fontSize: 13, color: "#7a8a9a", lineHeight: 1.5 }}>Menghubungi mitra di sekitar lokasi Anda. Harap tunggu.</div>
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

              {/* Accepted — mitra card + chat */}
              {orderStatus === "accepted" && acceptedMitra && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Banner */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#e8f8f2", borderRadius: 14, border: "1.5px solid #b2e8d4" }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a7a6a" }}>Mitra Ditemukan!</div>
                  </div>

                  {/* Mitra card */}
                  <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 18, padding: "18px 16px", background: "#fff" }}>
                    {/* Avatar + name row */}
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 14, background: "#e8f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>🧑‍🔧</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a", marginBottom: 3 }}>{acceptedMitra.name}</div>
                        <div style={{ fontSize: 13, color: "#f5a623", fontWeight: 700, marginBottom: 3 }}>
                          ⭐ {acceptedMitra.rating ?? "–"}{acceptedMitra.totalOrders > 0 ? ` · ${acceptedMitra.totalOrders} order` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#4a5568" }}>
                          {acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist * 1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`} · Est. {acceptedMitra.etaMin} menit
                        </div>
                      </div>
                    </div>

                    {/* Biaya | Est. Tiba — side by side with divider */}
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

                    {/* Tip */}
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "rgba(245,166,35,0.08)", borderRadius: 12, border: "1px solid rgba(245,166,35,0.2)" }}>
                      <span style={{ fontSize: 15 }}>💡</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>Diskusikan dulu biaya jasa & sparepart</div>
                        <div style={{ fontSize: 11, color: "#92400e", marginTop: 1 }}>Chat dengan mitra sebelum memanggil</div>
                      </div>
                    </div>
                  </div>

                  {/* Chat & Negosiasi toggle */}
                  <button
                    onClick={() => setChatOpen(o => !o)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px", borderRadius: 14, border: "none", background: chatOpen ? "#1a3a5c" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 17 }}>💬</span>
                    Chat & Negosiasi {chatOpen ? "∧" : "∨"}
                  </button>

                  {/* Chat panel */}
                  {chatOpen && (
                    <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden" }}>
                      {/* Chat header */}
                      <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div>
                      </div>

                      {/* Messages area */}
                      <div style={{ minHeight: 160, maxHeight: 220, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                        {chatMessages.length === 0 ? (
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0" }}>
                            <span style={{ fontSize: 32, opacity: 0.3 }}>💬</span>
                            <div style={{ fontSize: 12, color: "#b0bec5", textAlign: "center" }}>Mulai diskusi dengan mitra</div>
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

                      {/* Chat input */}
                      <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && sendChatMessage()}
                          placeholder="Ketik pesan..."
                          style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }}
                        />
                        <button
                          onClick={sendChatMessage}
                          disabled={!chatInput.trim() || chatSending}
                          style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? "linear-gradient(135deg, #1a3a5c, #1a7a6a)" : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                        >➤</button>
                      </div>
                    </div>
                  )}

                  {/* Setuju & Panggil Mitra */}
                  <button
                    onClick={async () => {
                      if (orderId) await fetch(`/api/pengguna/orders/${orderId}/confirm`, { method: "PATCH", credentials: "include" }).catch(() => {});
                      setMitraConfirmed(true);
                      setChatOpen(false);
                      setStep(4);
                    }}
                    disabled={mitraConfirmed}
                    style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: mitraConfirmed ? "#a5d6a7" : "linear-gradient(135deg, #2e7d32, #43a047)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: mitraConfirmed ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {mitraConfirmed ? "✅ Mitra Dikonfirmasi" : "✅ Setuju & Panggil Mitra"}
                  </button>

                  {/* Cari Mitra Lain */}
                  {!mitraConfirmed && (
                    <button
                      onClick={async () => {
                        if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {});
                        if (orderPollRef.current) clearInterval(orderPollRef.current);
                        if (chatPollRef.current) clearInterval(chatPollRef.current);
                        setOrderId(null); setOrderNo(""); setOrderStatus("creating");
                        setAcceptedMitra(null); setChatMessages([]); setChatInput(""); setChatOpen(false);
                        setMitraConfirmed(false);
                        setStep(2); setTimeout(() => setStep(3), 50);
                      }}
                      style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      🔄 Cari Mitra Lain
                    </button>
                  )}
                </div>
              )}

              {/* Cancelled */}
              {orderStatus === "cancelled" && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <span style={{ fontSize: 52 }}>😔</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginTop: 12 }}>Pesanan Dibatalkan</div>
                  <button onClick={() => navigate("/dashboard/pengguna")} style={{ marginTop: 16, padding: "12px 32px", borderRadius: 14, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom bar */}
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
            ) : orderStatus !== "accepted" ? (
              <button
                disabled
                style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "not-allowed" }}
              >
                {orderStatus === "creating" ? "Membuat pesanan..." : "Menunggu Mitra Menerima..."}
              </button>
            ) : null}
          </div>
        </>
      )}

      {/* ── STEP 4: TRACKING ── */}
      {step === 4 && acceptedMitra && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 0 100px" }}>

            {/* Live Map */}
            <div style={{ position: "relative", width: "100%", height: 220 }}>
              <div ref={trackMapRef} style={{ width: "100%", height: "100%" }} />
              {/* ETA & Distance overlay */}
              <div style={{ position: "absolute", top: 12, right: 12, zIndex: 500, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: "rgba(26,58,92,0.92)", backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                  🕐 {trackEta != null ? `± ${trackEta} menit` : `± ${acceptedMitra.etaMin} menit`}
                </div>
                <div style={{ background: "rgba(26,122,106,0.9)", backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" }}>
                  📏 {trackDist != null ? (trackDist < 1 ? `${Math.round(trackDist * 1000)} m` : `${trackDist.toFixed(1)} km`) : `${acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist * 1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`}`}
                </div>
              </div>
              {/* Legend */}
              <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 500, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#1a3a5c", display: "flex", alignItems: "center", gap: 6 }}>
                  🏍️ Mitra
                </div>
                <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#e53e3e", display: "flex", alignItems: "center", gap: 6 }}>
                  📍 Lokasi Anda
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 16px 0" }}>

              {/* Mitra card */}
              <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", marginBottom: 16, background: "#fff" }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧑‍🔧</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a" }}>{acceptedMitra.name}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>
                    ✅ Mitra Terverifikasi RIDE
                  </div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>
                    {acceptedMitra.rating != null ? `⭐ ${acceptedMitra.rating}` : "⭐ Baru"} · {acceptedMitra.totalOrders} order
                  </div>
                </div>
                <button
                  onClick={() => setChatOpen(o => !o)}
                  style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px solid #1a3a5c", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >💬 Chat</button>
              </div>

              {/* Chat panel (for step 4) */}
              {chatOpen && (
                <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #f0f4f8" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568" }}>💬 Chat dengan {acceptedMitra.name}</div>
                  </div>
                  <div style={{ minHeight: 120, maxHeight: 200, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 0" }}>
                        <span style={{ fontSize: 28, opacity: 0.3 }}>💬</span>
                        <div style={{ fontSize: 12, color: "#b0bec5", textAlign: "center" }}>Mulai diskusi dengan mitra</div>
                      </div>
                    ) : chatMessages.map(m => {
                      const isMine = m.senderRole === "pengguna";
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
                          <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                            {m.message}
                          </div>
                          <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChatMessage()} placeholder="Ketik pesan..." style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, outline: "none", background: "#fff" }} />
                    <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? "linear-gradient(135deg,#1a3a5c,#1a7a6a)" : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                  </div>
                </div>
              )}

              {/* Status perjalanan */}
              <div style={{ background: "#fff", border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>📍 Status Perjalanan</div>
                {(() => {
                  const phaseOrder = ["menuju", "tiba", "pengerjaan", "selesai"];
                  const curIdx = phaseOrder.indexOf(trackingPhase);
                  return [
                    { label: "Mitra menuju lokasi Anda", key: "menuju" },
                    { label: "Mitra sudah tiba", key: "tiba" },
                    { label: "Sedang pengerjaan", key: "pengerjaan" },
                    { label: "Pengerjaan selesai ✅", key: "selesai" },
                  ].map((ph, i) => {
                    const phIdx = phaseOrder.indexOf(ph.key);
                    const done = phIdx < curIdx;
                    const active = phIdx === curIdx;
                    return { label: ph.label, sub: active ? "Sekarang" : done ? "Selesai" : "", done, active };
                  });
                })().map((phase, i) => (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, background: phase.done ? "#1a7a6a" : phase.active ? "#1a3a5c" : "#e0e8f0", display: "flex", alignItems: "center", justifyContent: "center", border: phase.active ? "2px solid #1a7a6a" : "none" }}>
                        {phase.done ? <span style={{ color: "#fff", fontSize: 11 }}>✓</span>
                          : phase.active ? <div style={{ width: 7, height: 7, borderRadius: 4, background: "#1a7a6a" }} />
                          : <div style={{ width: 6, height: 6, borderRadius: 3, background: "#c0d0dc" }} />}
                      </div>
                      {i < 3 && <div style={{ width: 2, height: 28, background: "#e0e8f0", margin: "3px 0" }} />}
                    </div>
                    <div style={{ paddingBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: phase.active ? 700 : 500, color: phase.active ? "#1a2a3a" : "#9aa5b4" }}>{phase.label}</div>
                      {phase.sub && <div style={{ fontSize: 11, color: "#1a7a6a", fontWeight: 600, marginTop: 1 }}>• {phase.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 20px 20px", background: "linear-gradient(to top, #f0f4f8 90%, transparent)", zIndex: 100 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => navigate("/dashboard/pengguna")}
                style={{ flex: 1, padding: "15px", borderRadius: 16, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >← Kembali</button>
              <button
                disabled
                style={{ flex: 2, padding: "15px", borderRadius: 16, border: "none", background: "#d0d8e0", color: "#a0aab4", fontWeight: 700, fontSize: 15, cursor: "not-allowed" }}
              >Lanjut →</button>
            </div>
          </div>
        </>
      )}

      {/* ── STEP 5: BAYAR ── */}
      {step === 5 && (() => {
        const fmtIdr = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
        const VOUCHERS: Record<string, number> = { "RIDE10": 0.10, "RIDE20": 0.20, "GRATIS": 0.05 };
        const discountAmt = paymentData ? Math.round((paymentData.total * (VOUCHERS[voucherCode.toUpperCase()] ?? 0))) : 0;
        const finalTotal = paymentData ? Math.max(0, paymentData.total - discountAmt) : 0;
        const pmLabel: Record<string, string> = {
          cash: "Bayar Tunai ke Mitra",
          transfer: "Transfer Bank",
          qris: "Bayar via QRIS",
        };
        const pmDesc: Record<string, string> = {
          cash: `Siapkan uang tunai sebesar ${fmtIdr(finalTotal)} dan berikan langsung ke mitra.`,
          transfer: `Transfer ke rekening mitra sebesar ${fmtIdr(finalTotal)} dan tunjukkan bukti transfer.`,
          qris: `Scan QRIS mitra dan bayar sebesar ${fmtIdr(finalTotal)}.`,
        };
        const pmIcon: Record<string, string> = { cash: "💵", transfer: "🏦", qris: "📱" };
        const selectedMethod = paymentMethodUser ?? paymentData?.paymentMethod ?? "cash";

        return (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 120px" }}>
              <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  💳 Pembayaran
                </div>

                {/* Layanan Selesai notice */}
                <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 14, padding: "12px 16px", marginBottom: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a" }}>✅ Layanan Selesai!</div>
                  <div style={{ fontSize: 12, color: "#4a9a7a", marginTop: 3 }}>Silakan selesaikan pembayaran</div>
                </div>

                {/* State: Menunggu rincian */}
                {!paymentData && (
                  <div style={{ background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e0e8f0", padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Menunggu mitra mengisi rincian biaya...</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4" }}>Mitra sedang mempersiapkan data pembayaran untuk Anda</div>
                  </div>
                )}

                {/* State: Rincian diterima */}
                {paymentData && !paymentConfirmed && (
                  <>
                    {/* Rincian Biaya */}
                    <div style={{ borderRadius: 14, border: "1.5px solid #e0e8f0", overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1 }}>RINCIAN BIAYA</div>
                      {[
                        { label: "Biaya Panggilan", val: paymentData.biayaPanggilan },
                        { label: "Jasa Service", val: paymentData.biayaJasa },
                        ...(paymentData.biayaSparepart > 0 ? [{ label: "Biaya Sparepart", val: paymentData.biayaSparepart }] : []),
                        { label: "Biaya Layanan & Admin", val: paymentData.biayaLayanan },
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f0f4f8" }}>
                          <span style={{ fontSize: 13, color: "#4a5a6a" }}>{row.label}</span>
                          <span style={{ fontSize: 13, color: "#1a2a3a" }}>{fmtIdr(row.val)}</span>
                        </div>
                      ))}
                      {discountAmt > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f0f4f8", background: "#f0faf7" }}>
                          <span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>🎁 Diskon Voucher ({voucherCode.toUpperCase()})</span>
                          <span style={{ fontSize: 13, color: "#1a7a6a", fontWeight: 600 }}>-{fmtIdr(discountAmt)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#fff" }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: "#ea580c" }}>{fmtIdr(finalTotal)}</span>
                      </div>
                    </div>

                    {/* Kode Voucher */}
                    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0e8f0", padding: "14px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>🎁 Kode Voucher</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text" value={voucherCode} onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherDiscount(0); }}
                          placeholder="Contoh: RIDE10"
                          style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", fontWeight: 600 }}
                        />
                        <button
                          onClick={() => {
                            const disc = VOUCHERS[voucherCode.toUpperCase()];
                            setVoucherDiscount(disc ?? 0);
                          }}
                          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          Pakai
                        </button>
                      </div>
                      {voucherCode && VOUCHERS[voucherCode.toUpperCase()] == null && (
                        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>Kode voucher tidak valid</div>
                      )}
                      {voucherCode && VOUCHERS[voucherCode.toUpperCase()] != null && discountAmt > 0 && (
                        <div style={{ fontSize: 11, color: "#1a7a6a", fontWeight: 600, marginTop: 6 }}>✅ Voucher berhasil! Diskon {fmtIdr(discountAmt)}</div>
                      )}
                    </div>

                    {/* Metode Pembayaran */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>Metode Pembayaran</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        {(["cash", "transfer", "qris"] as const).map(m => (
                          <button key={m} onClick={() => setPaymentMethodUser(m)}
                            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: selectedMethod === m ? "2px solid #1a7a6a" : "1.5px solid #e0e8f0", background: selectedMethod === m ? "#f0faf7" : "#fff", color: selectedMethod === m ? "#1a7a6a" : "#7a8a9a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            {m === "cash" ? "Cash" : m === "transfer" ? "Transfer" : "QRIS"}
                          </button>
                        ))}
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 20 }}>{pmIcon[selectedMethod]}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{pmLabel[selectedMethod]}</div>
                          <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 3, lineHeight: 1.4 }}>{pmDesc[selectedMethod]}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* State: Pembayaran Berhasil */}
                {paymentConfirmed && (
                  <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 16, padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a6a", marginBottom: 6 }}>Pembayaran Berhasil!</div>
                    <div style={{ fontSize: 12, color: "#4a9a7a" }}>Terima kasih telah menggunakan RIDE</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center" }}>
                      <button
                        onClick={() => {
                          if (!paymentData) return;
                          const disc = voucherCode && paymentData ? Math.round(paymentData.total * ({"RIDE10":0.10,"RIDE20":0.20,"GRATIS":0.05}[voucherCode.toUpperCase()] ?? 0)) : 0;
                          const fin = Math.max(0, paymentData.total - disc);
                          const fmt = (n: number) => "Rp " + n.toLocaleString("id-ID");
                          const now = new Date();
                          const tgl = now.toLocaleDateString("id-ID", { day:"2-digit", month:"long", year:"numeric" });
                          const jam = now.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" });
                          const pmLabel: Record<string,string> = { cash:"Tunai", transfer:"Transfer Bank", qris:"QRIS" };
                          const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Struk RIDE - ${orderNo}</title><style>
                            *{margin:0;padding:0;box-sizing:border-box}
                            body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a2a3a;max-width:400px;margin:0 auto;padding:20px}
                            .logo{text-align:center;padding:20px 0 10px;border-bottom:2px solid #1a7a6a}
                            .logo-r{width:56px;height:56px;background:linear-gradient(135deg,#1a3a5c,#1a7a6a);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:900;margin-bottom:8px}
                            .logo-title{font-size:20px;font-weight:900;color:#1a3a5c;letter-spacing:4px}
                            .logo-sub{font-size:11px;color:#7a8a9a;margin-top:2px}
                            .badge-ok{display:inline-block;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;margin:12px 0}
                            .orderno{font-size:13px;color:#7a8a9a}
                            .orderno span{font-weight:700;color:#1a2a3a}
                            .section{margin-top:16px;border:1px solid #e0e8f0;border-radius:12px;overflow:hidden}
                            .section-title{background:#f8fafc;padding:8px 14px;font-size:10px;font-weight:800;color:#9aa5b4;letter-spacing:1px}
                            .row{display:flex;justify-content:space-between;padding:9px 14px;border-top:1px solid #f0f4f8;font-size:13px}
                            .row:first-of-type{border-top:none}
                            .row .label{color:#7a8a9a}
                            .row .val{font-weight:600;color:#1a2a3a;text-align:right;max-width:60%}
                            .divider{border:none;border-top:1px dashed #e0e8f0;margin:4px 0}
                            .total-row{display:flex;justify-content:space-between;padding:12px 14px;background:#f0faf7;font-size:15px;font-weight:900;color:#1a2a3a}
                            .total-row .total-val{color:#16a34a;font-size:16px}
                            ${disc>0?".discount-row{display:flex;justify-content:space-between;padding:9px 14px;border-top:1px solid #f0f4f8;font-size:13px;color:#16a34a;font-weight:600}":""}
                            .footer{text-align:center;margin-top:20px;padding-top:16px;border-top:1px dashed #e0e8f0;font-size:11px;color:#9aa5b4;line-height:1.8}
                            .footer strong{color:#1a7a6a}
                            @media print{body{padding:10px}button{display:none}}
                          </style></head><body>
                          <div class="logo">
                            <div class="logo-r">R</div>
                            <div class="logo-title">RIDE</div>
                            <div class="logo-sub">Super App Jasa Panggilan</div>
                          </div>
                          <div style="text-align:center;margin-top:12px">
                            <div class="badge-ok">✓ Pembayaran Berhasil</div>
                            <div class="orderno">No. Pesanan: <span>${orderNo}</span></div>
                            <div style="font-size:12px;color:#9aa5b4;margin-top:4px">${tgl} • ${jam}</div>
                          </div>
                          <div class="section">
                            <div class="section-title">DETAIL KENDARAAN</div>
                            <div class="row"><span class="label">Kendaraan</span><span class="val">${merekModel} ${tahun}</span></div>
                            <div class="row"><span class="label">Layanan</span><span class="val">${kategori.join(", ")}</span></div>
                            ${acceptedMitra?.name ? `<div class="row"><span class="label">Mitra Teknisi</span><span class="val">${acceptedMitra.name}</span></div>` : ""}
                          </div>
                          <div class="section">
                            <div class="section-title">RINCIAN BIAYA</div>
                            <div class="row"><span class="label">Biaya Panggilan</span><span class="val">${fmt(paymentData.biayaPanggilan)}</span></div>
                            <div class="row"><span class="label">Biaya Jasa Service</span><span class="val">${fmt(paymentData.biayaJasa)}</span></div>
                            ${paymentData.biayaSparepart > 0 ? `<div class="row"><span class="label">Biaya Sparepart</span><span class="val">${fmt(paymentData.biayaSparepart)}</span></div>` : ""}
                            <div class="row"><span class="label">Biaya Layanan & Admin</span><span class="val">${fmt(paymentData.biayaLayanan)}</span></div>
                            ${disc > 0 ? `<div class="discount-row"><span>🎁 Diskon Voucher (${voucherCode.toUpperCase()})</span><span>-${fmt(disc)}</span></div>` : ""}
                            <hr class="divider">
                            <div class="total-row"><span>Total Dibayar</span><span class="total-val">${fmt(fin)}</span></div>
                          </div>
                          <div class="section">
                            <div class="section-title">PEMBAYARAN</div>
                            <div class="row"><span class="label">Metode</span><span class="val">${pmLabel[paymentData.paymentMethod] ?? paymentData.paymentMethod}</span></div>
                            <div class="row"><span class="label">Status</span><span class="val" style="color:#16a34a">✓ Lunas</span></div>
                          </div>
                          <div class="footer">
                            Terima kasih telah menggunakan <strong>RIDE</strong><br>
                            Simpan struk ini sebagai bukti transaksi<br>
                            <span style="font-size:10px">Dicetak: ${tgl} ${jam}</span>
                          </div>
                          <script>window.onload=()=>{window.print()}</script>
                          </body></html>`;
                          const w = window.open("", "_blank");
                          if (w) { w.document.write(html); w.document.close(); }
                        }}
                        style={{ padding: "10px 22px", borderRadius: 12, border: "1.5px solid #e0e8f0", background: "#fff", color: "#1a2a3a", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        📄 Struk
                      </button>
                      <button
                        onClick={() => setShowReviewModal(true)}
                        style={{ padding: "10px 22px", borderRadius: 12, border: "2px solid #f59e0b", background: "#fff", color: "#d97706", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        ⭐ Beri Ulasan
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Bottom action */}
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px 28px", background: "#fff", borderTop: "1px solid #e8f0f8", zIndex: 100 }}>
              {!paymentData && (
                <button disabled style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#e0e8f0", color: "#9aa5b4", fontWeight: 700, fontSize: 15 }}>
                  ⏳ Menunggu data pembayaran...
                </button>
              )}
              {paymentData && !paymentConfirmed && (
                <button
                  onClick={() => setPaymentConfirmed(true)}
                  style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  ✅ Konfirmasi Pembayaran
                </button>
              )}
              {paymentConfirmed && (
                <button
                  onClick={() => navigate("/dashboard/pengguna")}
                  style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#f0f4f8", color: "#4a5a6a", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  ← Kembali
                </button>
              )}
            </div>
          </>
        );
      })()}
    {showReviewModal && <ReviewModal orderId={orderId} onClose={() => setShowReviewModal(false)} />}
    </div>
  );
}
