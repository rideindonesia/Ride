import { useState, useRef, useEffect, useCallback } from "react";
import { calcBiayaPanggilan, calcEtaSecsLive, loadTarif } from "../utils/pricing";
import { useLocation } from "wouter";
import ReviewModal from "@/components/ReviewModal";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const svc = "gofood";

const meta = {
  emoji: "🍔",
  title: "RIDE Food",
  sub: "Pesan makanan dari merchant favorit",
  step1Title: "🍔 Pilih Merchant & Menu",
};

const STEPS = [
  { label: "Menu", emoji: "🍔" },
  { label: "Antar", emoji: "🗺️" },
  { label: "Mitra", emoji: "🧑‍✈️" },
  { label: "Tracking", emoji: "📡" },
  { label: "Bayar", emoji: "💳" },
];

type Merchant = {
  id: number; name: string; category: string; description: string | null;
  address: string | null; lat: number | null; lng: number | null;
  photoPath: string | null; isOpen: boolean;
};

type MenuItem = {
  id: number; name: string; description: string | null; price: number;
  category: string | null; isAvailable: boolean;
};

type CartItem = { id: number; name: string; qty: number; price: number; note?: string };

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

async function searchPlaces(query: string): Promise<{ name: string; lat: number; lng: number }[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&accept-language=id&countrycodes=id&limit=6`,
      { headers: { "Accept-Language": "id" } }
    );
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((d: any) => ({ name: String(d.display_name ?? ""), lat: parseFloat(d.lat), lng: parseFloat(d.lon) }))
      .filter((r: { name: string; lat: number; lng: number }) => r.name && !Number.isNaN(r.lat) && !Number.isNaN(r.lng));
  } catch { return []; }
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

export default function OrderFood() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Step 1 — merchant + menu + cart
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "menu">("list");
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // GPS
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // Step 2 — pickup (merchant) + destination (user)
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [destAddress, setDestAddress] = useState("");
  const [detailAlamat, setDetailAlamat] = useState("");
  // Pencarian tujuan (forward geocode) — agar user bisa ketik tempat, tak hanya geser peta
  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [destSearching, setDestSearching] = useState(false);
  const [destSearchOpen, setDestSearchOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Order lifecycle (step 3)
  type AcceptedMitra = {
    id: number; name: string; lat: number; lng: number; serviceType: string;
    rating: number | null; totalOrders: number; dist: number; callFee: number; etaMin: number;
    photo: string | null;
  };
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [orderStatus, setOrderStatus] = useState<"creating" | "pending" | "accepted" | "done" | "cancelled">("creating");
  const [acceptedMitra, setAcceptedMitra] = useState<AcceptedMitra | null>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [mitraRejectedCount, setMitraRejectedCount] = useState(0);
  const [searchElapsed, setSearchElapsed] = useState(0);
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
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const [routeDistKm, setRouteDistKm] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Step 4 tracking
  const [mitraTrackLat, setMitraTrackLat] = useState<number | null>(null);
  const [mitraTrackLng, setMitraTrackLng] = useState<number | null>(null);
  const [trackDist, setTrackDist] = useState<number | null>(null);
  const [trackEta, setTrackEta] = useState<number | null>(null);
  const [trackingPhase, setTrackingPhase] = useState<string>("menuju");
  const [merchantStatus, setMerchantStatus] = useState<string>("menunggu");
  type PaymentData = { biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string };
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [voucherMsg, setVoucherMsg] = useState("");
  const [paymentMethodUser, setPaymentMethodUser] = useState<"cash" | "transfer" | "qris">("cash");
  const trackMapRef = useRef<HTMLDivElement>(null);
  const trackLeafletRef = useRef<L.Map | null>(null);
  const trackMitraMarkerRef = useRef<L.Marker | null>(null);
  const trackUserMarkerRef = useRef<L.Marker | null>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subtotal item (keranjang)
  const subtotal = cart.reduce((sum, c) => sum + c.qty * c.price, 0);

  // Ongkir distance & estimated fare (merchant → destination, mengikuti jalan via OSRM — no hardcode).
  // Prefer road distance; fall back to straight-line while OSRM is loading/unavailable.
  const tripDistKm = routeDistKm ?? ((pickupLat != null && pickupLng != null && destLat != null && destLng != null)
    ? haversineDist(pickupLat, pickupLng, destLat, destLng) : null);
  const estFee = tripDistKm != null ? calcBiayaPanggilan(svc, tripDistKm) : null;

  const canNext1 = cart.length > 0;
  const canNext2 = pickupLat != null && pickupLng != null && destLat != null && destLng != null && pickupAddress && destAddress;

  // Load tarif dinamis dari DB
  useEffect(() => { loadTarif(BASE); }, []);

  // Fetch daftar merchant on mount
  useEffect(() => {
    setLoadingMerchants(true);
    setMerchantsError(null);
    fetch(`${BASE}/api/pengguna/merchants`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setMerchants(d.merchants ?? []); })
      .catch(() => setMerchantsError("Gagal memuat daftar merchant. Coba lagi."))
      .finally(() => setLoadingMerchants(false));
  }, []);

  // Identify socket as pengguna on mount
  useEffect(() => {
    fetch("/api/auth/me?role=pengguna", { credentials: "include" })
      .then(r => r.json())
      .then(me => { if (me.id) identifySocket(me.id, "pengguna"); })
      .catch(() => {});
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
        setPickupLat(pLat);
        setPickupLng(pLng);
        setPickupAddress(data.pickupAddress || "");
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
          photo: data.mitra.profilePhotoPath ?? null,
        });
        setMitraConfirmed(true);
        if (data.merchantStatus) setMerchantStatus(data.merchantStatus);
        if (data.trackingPhase === "selesai") {
          if (data.paymentData) setPaymentData(data.paymentData);
          setStep(5);
        } else {
          setStep(4);
        }
      })
      .catch(() => {});
  }, []);

  // Init map on step 2 (pick destination only; pickup = merchant)
  useEffect(() => {
    if (step !== 2 || !mapRef.current) return;
    if (leafletMapRef.current) return;

    const lat = destLat ?? selectedMerchant?.lat ?? userLat ?? -1.2654;
    const lng = destLng ?? selectedMerchant?.lng ?? userLng ?? 116.8312;

    const map = L.map(mapRef.current, { center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

    if (userLat !== null && userLng !== null) {
      gpsMarkerRef.current = L.circleMarker([userLat, userLng], {
        radius: 8, color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 1, weight: 3,
      }).addTo(map);
    }

    // Merchant (pickup) marker — fixed
    if (selectedMerchant?.lat != null && selectedMerchant?.lng != null) {
      const merchantIcon = L.divIcon({ html: '<div style="width:30px;height:30px;background:#1a7a6a;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🏪</div>', iconSize: [30, 30], iconAnchor: [15, 30], className: "" });
      pickupMarkerRef.current = L.marker([selectedMerchant.lat, selectedMerchant.lng], { icon: merchantIcon }).addTo(map).bindPopup("Merchant");
    }

    // Default: set destination to current center if not already picked
    if (destLat == null) {
      setDestLat(lat); setDestLng(lng);
      setIsGeocoding(true);
      reverseGeocode(lat, lng).then(addr => { setDestAddress(addr); setIsGeocoding(false); });
    }

    map.on("moveend", () => {
      const center = map.getCenter();
      setIsGeocoding(true);
      setDestLat(center.lat); setDestLng(center.lng);
      reverseGeocode(center.lat, center.lng).then(addr => {
        setDestAddress(addr);
        setIsGeocoding(false);
      });
    });

    leafletMapRef.current = map;
  }, [step, userLat, userLng]);

  // Debounce pencarian tujuan
  useEffect(() => {
    if (step !== 2) return;
    const q = destQuery.trim();
    if (q.length < 3) { setDestResults([]); setDestSearching(false); return; }
    setDestSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = await searchPlaces(q);
      if (cancelled) return; // abaikan hasil basi (query sudah berubah)
      setDestResults(results);
      setDestSearching(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [destQuery, step]);

  // Pilih salah satu hasil pencarian → geser peta ke lokasi (moveend akan set dest + reverse-geocode)
  function pickDestResult(r: { name: string; lat: number; lng: number }) {
    setDestSearchOpen(false);
    setDestQuery("");
    setDestResults([]);
    setDestLat(r.lat); setDestLng(r.lng);
    setDestAddress(r.name.split(",").slice(0, 3).join(",").trim());
    if (leafletMapRef.current) {
      leafletMapRef.current.setView([r.lat, r.lng], 17);
    } else {
      setIsGeocoding(true);
      reverseGeocode(r.lat, r.lng).then(addr => { if (addr) setDestAddress(addr); setIsGeocoding(false); });
    }
  }

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

  // When leaving step 2, cleanup map
  useEffect(() => {
    return () => {
      if (step === 2 && leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        gpsMarkerRef.current = null;
        pickupMarkerRef.current = null;
        destMarkerRef.current = null;
        routePolylineRef.current = null;
      }
    };
  }, [step]);

  // Ambil rute jalan (OSRM) merchant→tujuan: set jarak ongkir + gambar garis biru mengikuti jalan
  useEffect(() => {
    if (step !== 2) return;
    if (pickupLat == null || pickupLng == null || destLat == null || destLng == null) {
      setRouteDistKm(null);
      setRouteLoading(false);
      if (routePolylineRef.current && leafletMapRef.current) { routePolylineRef.current.remove(); routePolylineRef.current = null; }
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        const route = data?.routes?.[0];
        if (cancelled) return;
        if (route && typeof route.distance === "number" && route.distance > 0) {
          setRouteDistKm(route.distance / 1000);
          const coords: [number, number][] = (route.geometry?.coordinates ?? []).map((c: [number, number]) => [c[1], c[0]]);
          const map = leafletMapRef.current;
          if (map && coords.length > 1) {
            if (routePolylineRef.current) routePolylineRef.current.setLatLngs(coords);
            else routePolylineRef.current = L.polyline(coords, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
          }
        } else {
          setRouteDistKm(null);
          if (routePolylineRef.current) { routePolylineRef.current.remove(); routePolylineRef.current = null; }
        }
      } catch {
        if (!cancelled) { setRouteDistKm(null); if (routePolylineRef.current) { routePolylineRef.current.remove(); routePolylineRef.current = null; } } // fallback haversine dipakai otomatis
      } finally {
        clearTimeout(timer);
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
  }, [step, pickupLat, pickupLng, destLat, destLng]);

  function calcDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    return haversineDist(lat1, lng1, lat2, lng2);
  }

  // Step 1 — select merchant → fetch detail + menu
  const selectMerchant = async (m: Merchant) => {
    setSelectedMerchant(m);
    setViewMode("menu");
    setMenu([]);
    setLoadingMenu(true);
    setPickupLat(m.lat);
    setPickupLng(m.lng);
    setPickupAddress(m.address || m.name);
    try {
      const r = await fetch(`${BASE}/api/pengguna/merchants/${m.id}`, { credentials: "include" });
      const d = await r.json();
      if (d.merchant) {
        setSelectedMerchant(d.merchant);
        setPickupLat(d.merchant.lat ?? m.lat);
        setPickupLng(d.merchant.lng ?? m.lng);
        setPickupAddress(d.merchant.address || d.merchant.name || m.name);
      }
      setMenu(d.menu ?? []);
    } catch {
      setMenu([]);
    } finally {
      setLoadingMenu(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const found = prev.find(c => c.id === item.id);
      if (found) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: item.id, name: item.name, qty: 1, price: item.price }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => {
      const found = prev.find(c => c.id === id);
      if (!found) return prev;
      if (found.qty <= 1) return prev.filter(c => c.id !== id);
      return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c);
    });
  };

  const cartQty = (id: number) => cart.find(c => c.id === id)?.qty ?? 0;

  // Step 3 — Phase 1: create order
  useEffect(() => {
    if (step !== 3) return;
    if (orderId) return;

    setOrderStatus("creating");
    setMitraRejectedCount(0);
    setAcceptedMitra(null);
    setCreateError(null);

    const address = pickupAddress || selectedMerchant?.address || selectedMerchant?.name || "Lokasi merchant";
    const lat = pickupLat ?? selectedMerchant?.lat ?? 0;
    const lng = pickupLng ?? selectedMerchant?.lng ?? 0;

    const formData = new FormData();
    formData.append("serviceType", svc);
    if (selectedMerchant) formData.append("merchantId", String(selectedMerchant.id));
    formData.append("orderItems", JSON.stringify(cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, ...(c.note ? { note: c.note } : {}) }))));
    formData.append("pickupAddress", address);
    formData.append("pickupLat", String(lat));
    formData.append("pickupLng", String(lng));
    if (detailAlamat) formData.append("detailAlamat", detailAlamat);
    if (destLat != null) formData.append("destLat", String(destLat));
    if (destLng != null) formData.append("destLng", String(destLng));
    if (destAddress) formData.append("destAddress", destAddress);

    fetch(`${BASE}/api/pengguna/orders`, { method: "POST", credentials: "include", body: formData })
      .then(r => r.json())
      .then(d => {
        if (!d.orderId) {
          if (d.error === "Belum login") { setCreateError("Sesi berakhir. Silakan masuk ulang."); return; }
          setCreateError(d.error ?? "Gagal membuat pesanan. Coba lagi.");
          return;
        }
        setOrderId(d.orderId);
        setOrderNo(d.orderNo);
        setOrderStatus("pending");
      })
      .catch(() => setCreateError("Koneksi gagal. Coba lagi."));
  }, [step, orderId]);

  // Timer elapsed saat mencari mitra
  useEffect(() => {
    if (orderStatus !== "pending") { setSearchElapsed(0); return; }
    const t = setInterval(() => setSearchElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [orderStatus]);

  // Step 3 — Phase 2: socket + backup polling for order status when pending
  useEffect(() => {
    if (step !== 3 || !orderId || orderStatus !== "pending") return;

    const lat = pickupLat ?? userLat ?? 0;
    const lng = pickupLng ?? userLng ?? 0;

    const applyOrderData = (od: any) => {
      if (od.status === "accepted" && od.mitra) {
        const mitraLat = od.mitra.lat ?? 0;
        const mitraLng = od.mitra.lng ?? 0;
        const dist = calcDist(lat, lng, mitraLat, mitraLng);
        const callFee = od.totalAmount ?? estFee ?? calcBiayaPanggilan(svc, tripDistKm ?? 0);
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
          photo: od.mitra.profilePhotoPath ?? null,
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

    const onAccepted = (data: any) => {
      if (data.orderId !== orderId) return;
      fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" })
        .then(r => r.json()).then(applyOrderData).catch(() => {});
    };
    socket.on("order:accepted", onAccepted);

    const onRejected = (data: any) => { if (data.orderId !== orderId) return; setMitraRejectedCount(c => c + 1); };
    socket.on("order:rejected", onRejected);

    doPoll();
    orderPollRef.current = setInterval(doPoll, 30000);
    return () => {
      if (orderPollRef.current) clearInterval(orderPollRef.current);
      socket.off("order:accepted", onAccepted);
      socket.off("order:rejected", onRejected);
    };
  }, [step, orderId, orderStatus]);

  // Real-time chat via socket when order accepted
  useEffect(() => {
    if (orderStatus !== "accepted" || !orderId) return;

    fetch(`/api/chat/${orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setChatMessages(data.messages ?? []);
        setTimeout(() => {
          const el = chatBottomRef.current?.parentElement;
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      }).catch(() => {});

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

    const onCancelledByMitra = (data: { orderId: number }) => {
      if (data.orderId !== orderId) return;
      setOrderStatus("cancelled");
    };
    socket.on("order:cancelled", onCancelledByMitra);

    return () => {
      leaveOrderRoom(orderId);
      socket.off("chat:message", onChat);
      socket.off("order:cancelled", onCancelledByMitra);
    };
  }, [orderStatus, orderId]);

  // Step 4: poll mitra location + socket for phase/payment/done
  useEffect(() => {
    if (step !== 4 || !orderId || !pickupLat || !pickupLng) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pengguna/orders/${orderId}`, { credentials: "include" });
        const data = await res.json();
        const mLat: number | null = data.mitra?.lat ?? null;
        const mLng: number | null = data.mitra?.lng ?? null;
        if (mLat && mLng) {
          setMitraTrackLat(mLat);
          setMitraTrackLng(mLng);
          const dist = haversineDist(mLat, mLng, pickupLat, pickupLng);
          setTrackDist(dist);
          setTrackEta(Math.ceil(calcEtaSecsLive(dist, data.mitra?.speedKmh) / 60));
        }
        if (data.trackingPhase) setTrackingPhase(data.trackingPhase);
        if (data.merchantStatus) setMerchantStatus(data.merchantStatus);
        if (data.paymentData) setPaymentData(data.paymentData);
        if (data.trackingPhase === "selesai") setStep(5);
        if (data.paymentConfirmedAt) setPaymentConfirmed(true);
        if (data.status === "done") { setOrderStatus("done"); setOrderTotal(data.totalAmount); }
      } catch { /* ignore */ }
    };

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
    const onMerchantStatus = (data: any) => {
      if (data.orderId !== orderId) return;
      if (data.merchantStatus) setMerchantStatus(data.merchantStatus);
      poll();
    };
    socket.on("order:phase", onPhase);
    socket.on("order:payment", onPayment);
    socket.on("order:done", onDone);
    socket.on("order:merchant_status", onMerchantStatus);

    poll();
    trackingPollRef.current = setInterval(poll, 4000);
    return () => {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
      socket.off("order:phase", onPhase);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
      socket.off("order:merchant_status", onMerchantStatus);
    };
  }, [step, orderId, pickupLat, pickupLng]);

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
        if (data.paymentConfirmedAt) setPaymentConfirmed(true);
        if (data.status === "done") { setOrderStatus("done"); setOrderTotal(data.totalAmount); }
      } catch { /* ignore */ }
    };
    poll();
    step5PollRef.current = setInterval(poll, 30000);
    return () => {
      if (step5PollRef.current) clearInterval(step5PollRef.current);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
    };
  }, [step, orderId]);

  // Step 4: init & update tracking Leaflet map
  useEffect(() => {
    if (step !== 4 || !trackMapRef.current || !pickupLat || !pickupLng) return;
    if (!trackLeafletRef.current) {
      const centerLat = mitraTrackLat ?? pickupLat;
      const centerLng = mitraTrackLng ?? pickupLng;
      const map = L.map(trackMapRef.current, { zoomControl: false, attributionControl: false })
        .setView([centerLat, centerLng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const userIcon = L.divIcon({ html: '<div style="width:28px;height:28px;background:#e53e3e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">📍</div>', iconSize: [28, 28], iconAnchor: [14, 28], className: "" });
      trackUserMarkerRef.current = L.marker([pickupLat, pickupLng], { icon: userIcon }).addTo(map).bindPopup("Titik Jemput");
      const mitraIcon = L.divIcon({ html: `<div style="width:34px;height:34px;background:#1a3a5c;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">${meta.emoji}</div>`, iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
      if (mitraTrackLat && mitraTrackLng) {
        trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mitraIcon }).addTo(map).bindPopup("Mitra");
        const bounds = L.latLngBounds([[pickupLat, pickupLng], [mitraTrackLat, mitraTrackLng]]);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
      trackLeafletRef.current = map;
    } else if (mitraTrackLat && mitraTrackLng && trackMitraMarkerRef.current) {
      trackMitraMarkerRef.current.setLatLng([mitraTrackLat, mitraTrackLng]);
      const bounds = L.latLngBounds([[pickupLat, pickupLng], [mitraTrackLat, mitraTrackLng]]);
      trackLeafletRef.current.fitBounds(bounds, { padding: [40, 40] });
    } else if (mitraTrackLat && mitraTrackLng && trackLeafletRef.current) {
      const mitraIcon = L.divIcon({ html: `<div style="width:34px;height:34px;background:#1a3a5c;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">${meta.emoji}</div>`, iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
      trackMitraMarkerRef.current = L.marker([mitraTrackLat, mitraTrackLng], { icon: mitraIcon }).addTo(trackLeafletRef.current).bindPopup("Mitra");
      const bounds = L.latLngBounds([[pickupLat, pickupLng], [mitraTrackLat, mitraTrackLng]]);
      trackLeafletRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [step, mitraTrackLat, mitraTrackLng, pickupLat, pickupLng]);

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
      const r = await fetch(`/api/pengguna/chat/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      });
      if (r.status === 401) { alert("Sesi Anda telah habis. Silakan login ulang."); window.location.href = "/"; return; }
    } catch { /* ignore */ } finally {
      setChatSending(false);
    }
  };

  const snapToGps = useCallback(() => {
    if (!leafletMapRef.current || userLat === null || userLng === null) return;
    leafletMapRef.current.setView([userLat, userLng], 16, { animate: true });
  }, [userLat, userLng]);

  const goToStep2 = () => setStep(2);

  // Group menu by category
  const menuByCategory = menu.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category || "Lainnya";
    (acc[cat] ??= []).push(item);
    return acc;
  }, {});
  const menuCategories = Object.keys(menuByCategory);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {step !== 3 && (
            <button
              onClick={() => {
                if (step === 1) {
                  if (viewMode === "menu") { setViewMode("list"); return; }
                  navigate("/dashboard/pengguna"); return;
                }
                if (step === 2) { setStep(1); return; }
                navigate("/dashboard/pengguna");
              }}
              style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", flexShrink: 0 }}
            >&lt;-</button>
          )}
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>{meta.emoji} {meta.title}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>{meta.sub}</div>
          </div>
        </div>
        <StepProgress step={step} />
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 120px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>

              {viewMode === "list" && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 20 }}>{meta.step1Title}</div>

                  {loadingMerchants && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
                      <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                      <div style={{ fontSize: 13, color: "#7a8a9a" }}>Memuat daftar merchant...</div>
                    </div>
                  )}

                  {merchantsError && !loadingMerchants && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <span style={{ fontSize: 40 }}>⚠️</span>
                      <div style={{ fontSize: 13, color: "#ea580c", fontWeight: 600, marginTop: 10 }}>{merchantsError}</div>
                    </div>
                  )}

                  {!loadingMerchants && !merchantsError && merchants.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <span style={{ fontSize: 40, opacity: 0.4 }}>🏪</span>
                      <div style={{ fontSize: 13, color: "#9aa5b4", marginTop: 10 }}>Belum ada merchant tersedia saat ini.</div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {merchants.map(m => (
                      <button
                        key={m.id}
                        onClick={() => selectMerchant(m)}
                        style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", padding: "14px", borderRadius: 16, border: "1.5px solid #e0e8f0", background: "#fff", cursor: "pointer" }}
                      >
                        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#f0faf7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, overflow: "hidden" }}>
                          {m.photoPath ? <img src={m.photoPath} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 2 }}>{m.name}</div>
                          <div style={{ fontSize: 12, color: "#1a7a6a", fontWeight: 600, marginBottom: 3 }}>{m.category}</div>
                          {m.description && <div style={{ fontSize: 12, color: "#7a8a9a", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{m.description}</div>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: m.isOpen ? "#1a7a6a" : "#e53e3e", background: m.isOpen ? "rgba(26,122,106,0.1)" : "rgba(229,62,62,0.1)", padding: "4px 8px", borderRadius: 8, flexShrink: 0 }}>
                          {m.isOpen ? "BUKA" : "TUTUP"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {viewMode === "menu" && selectedMerchant && (
                <>
                  <button onClick={() => setViewMode("list")} style={{ fontSize: 12, fontWeight: 700, color: "#1a7a6a", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 14 }}>← Ganti Merchant</button>

                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, padding: "12px", background: "#f0faf7", borderRadius: 16, border: "1.5px solid #b6e6d7" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, overflow: "hidden" }}>
                      {selectedMerchant.photoPath ? <img src={selectedMerchant.photoPath} alt={selectedMerchant.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a" }}>{selectedMerchant.name}</div>
                      <div style={{ fontSize: 12, color: "#4a9a7a" }}>{selectedMerchant.category}{selectedMerchant.address ? ` · ${selectedMerchant.address}` : ""}</div>
                    </div>
                  </div>

                  {loadingMenu && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
                      <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                      <div style={{ fontSize: 13, color: "#7a8a9a" }}>Memuat menu...</div>
                    </div>
                  )}

                  {!loadingMenu && menu.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <span style={{ fontSize: 40, opacity: 0.4 }}>🍽️</span>
                      <div style={{ fontSize: 13, color: "#9aa5b4", marginTop: 10 }}>Menu belum tersedia di merchant ini.</div>
                    </div>
                  )}

                  {!loadingMenu && menuCategories.map(cat => (
                    <div key={cat} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a3a5c", marginBottom: 10, letterSpacing: 0.3 }}>{cat}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {menuByCategory[cat].map(item => {
                          const qty = cartQty(item.id);
                          return (
                            <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#fff" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{item.name}</div>
                                {item.description && <div style={{ fontSize: 12, color: "#7a8a9a", lineHeight: 1.4, marginTop: 2 }}>{item.description}</div>}
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a", marginTop: 4 }}>Rp {item.price.toLocaleString("id-ID")}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                {qty > 0 && (
                                  <>
                                    <button onClick={() => removeFromCart(item.id)} style={{ width: 30, height: 30, borderRadius: 10, border: "1.5px solid #1a7a6a", background: "#fff", color: "#1a7a6a", fontSize: 18, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", minWidth: 18, textAlign: "center" }}>{qty}</span>
                                  </>
                                )}
                                <button onClick={() => addToCart(item)} style={{ width: 30, height: 30, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {cart.length > 0 && (
                    <div style={{ marginTop: 8, borderRadius: 16, border: "1.5px solid #e0e8f0", overflow: "hidden" }}>
                      <div style={{ background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1 }}>🛒 KERANJANG</div>
                      {cart.map(c => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #f0f4f8" }}>
                          <span style={{ fontSize: 13, color: "#4a5a6a" }}>{c.qty}× {c.name}</span>
                          <span style={{ fontSize: 13, color: "#1a2a3a" }}>Rp {(c.qty * c.price).toLocaleString("id-ID")}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#fff" }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Subtotal Item</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: "#1a7a6a" }}>Rp {subtotal.toLocaleString("id-ID")}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {viewMode === "menu" && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100 }}>
              <button disabled={!canNext1} onClick={goToStep2} style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: canNext1 ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext1 ? "pointer" : "not-allowed" }}>
                {canNext1 ? `Lanjut · Rp ${subtotal.toLocaleString("id-ID")} →` : "Pilih menu dulu"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 16 }}>🗺️ Titik Antar</div>

              {/* Cari tujuan */}
              <div style={{ position: "relative", marginBottom: 12, zIndex: 1200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#f8fafc", border: "1.5px solid #e0e8f0", borderRadius: 14 }}>
                  <span style={{ fontSize: 15 }}>🔍</span>
                  <input
                    value={destQuery}
                    onChange={e => { setDestQuery(e.target.value); setDestSearchOpen(true); }}
                    onFocus={() => setDestSearchOpen(true)}
                    placeholder="Cari tujuan (mis. Balikpapan Super Block)"
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#1a2a3a" }}
                  />
                  {destQuery && <button onClick={() => { setDestQuery(""); setDestResults([]); }} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: "#9aa5b4", padding: 0 }}>✕</button>}
                </div>
                {destSearchOpen && (destSearching || destResults.length > 0 || destQuery.trim().length >= 3) && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", overflow: "hidden", maxHeight: 240, overflowY: "auto", border: "1px solid #eef2f6" }}>
                    {destSearching && <div style={{ padding: "12px 14px", fontSize: 13, color: "#7a8a9a" }}>Mencari...</div>}
                    {!destSearching && destResults.length === 0 && destQuery.trim().length >= 3 && (
                      <div style={{ padding: "12px 14px", fontSize: 13, color: "#7a8a9a" }}>Tempat tidak ditemukan</div>
                    )}
                    {!destSearching && destResults.map((r, i) => (
                      <button key={i} onClick={() => pickDestResult(r)} style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: i < destResults.length - 1 ? "1px solid #f0f4f8" : "none", background: "#fff", cursor: "pointer" }}>
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span>
                        <span style={{ fontSize: 13, color: "#1a3a5c", lineHeight: 1.4 }}>{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Map with center pin */}
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 16, height: 260 }}>
                <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

                {/* Fixed center pin */}
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", marginBottom: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2a3a", whiteSpace: "nowrap" }}>
                      {isGeocoding ? "Memuat..." : "Titik Antar"}
                    </div>
                    {!isGeocoding && <div style={{ fontSize: 10, color: "#7a8a9a", whiteSpace: "nowrap" }}>Geser untuk sesuaikan</div>}
                  </div>
                  <span style={{ fontSize: 32, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>🏁</span>
                </div>

                {/* GPS button bottom-right */}
                <button onClick={snapToGps} style={{ position: "absolute", bottom: 12, right: 12, zIndex: 1000, width: 42, height: 42, borderRadius: 12, background: "#fff", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#1a3a5c", letterSpacing: 0.5 }}>GPS</span>
                </button>
              </div>

              {/* Pickup (merchant) address */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: "rgba(26,122,106,0.07)", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(26,122,106,0.2)" }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🏪</span>
                <div>
                  <div style={{ fontSize: 10, color: "#1a7a6a", fontWeight: 700 }}>AMBIL DARI MERCHANT</div>
                  <div style={{ fontSize: 13, color: "#1a3a5c", lineHeight: 1.4 }}>{pickupAddress || selectedMerchant?.name || "Belum dipilih"}</div>
                </div>
              </div>

              {/* Destination address */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: "rgba(229,62,62,0.06)", borderRadius: 12, marginBottom: 16, border: "1px solid rgba(229,62,62,0.2)" }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🏁</span>
                <div>
                  <div style={{ fontSize: 10, color: "#e53e3e", fontWeight: 700 }}>ANTAR KE</div>
                  <div style={{ fontSize: 13, color: "#1a3a5c", lineHeight: 1.4 }}>{destAddress || "Belum dipilih — geser peta"}</div>
                </div>
              </div>

              {/* Ringkasan subtotal + estimasi ongkir */}
              <div style={{ borderRadius: 14, border: "1.5px solid #b6e6d7", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", background: "#fff", borderBottom: "1px solid #eef6f2" }}>
                  <span style={{ fontSize: 13, color: "#4a5a6a" }}>Subtotal Item</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>Rp {subtotal.toLocaleString("id-ID")}</span>
                </div>
                {tripDistKm != null && estFee != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", background: "#f0faf7" }}>
                    <span style={{ fontSize: 13, color: "#4a9a7a" }}>Estimasi Ongkir · {tripDistKm.toFixed(1)} km {routeLoading ? "· menghitung rute..." : routeDistKm != null ? "· via jalan" : ""}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1a7a6a" }}>Rp {estFee.toLocaleString("id-ID")}</span>
                  </div>
                )}
              </div>

              {/* Detail Alamat */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 8 }}>Detail Alamat <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span></label>
                <textarea value={detailAlamat} onChange={e => setDetailAlamat(e.target.value)} placeholder="Depan Indomaret, dekat lampu merah..." rows={2} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1.5px solid #e0e8f0", fontSize: 15, color: "#1a2a3a", background: "#f8fafc", outline: "none", resize: "none", lineHeight: 1.5 }} />
              </div>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px", background: "linear-gradient(to top, #f0f4f8 80%, transparent)", zIndex: 100, display: "flex", gap: 12 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: "17px", borderRadius: 16, border: "1.5px solid #1a3a5c", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>← Kembali</button>
            <button
              disabled={!canNext2}
              onClick={() => {
                if (leafletMapRef.current) {
                  leafletMapRef.current.remove();
                  leafletMapRef.current = null;
                  gpsMarkerRef.current = null;
                  pickupMarkerRef.current = null;
                  destMarkerRef.current = null;
                  routePolylineRef.current = null;
                }
                setStep(3);
              }}
              style={{ flex: 2, padding: "17px", borderRadius: 16, border: "none", background: canNext2 ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: canNext2 ? "pointer" : "not-allowed" }}
            >Lanjut →</button>
          </div>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 100px" }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 16px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 24 }}>{meta.emoji} Cari Mitra</div>

              {(orderStatus === "creating" || createError) && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0 24px" }}>
                  {createError ? (
                    <>
                      <span style={{ fontSize: 48 }}>⚠️</span>
                      <div style={{ fontSize: 14, color: "#ea580c", fontWeight: 600, textAlign: "center" }}>{createError}</div>
                      {createError?.includes("masuk ulang") ? (
                        <button onClick={() => navigate("/")} style={{ padding: "12px 32px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#1a3a5c,#2a5298)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Masuk Ulang</button>
                      ) : (
                        <button onClick={() => navigate("/dashboard/pengguna")} style={{ padding: "12px 32px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
                      )}
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
                  <div style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", borderRadius: 20, padding: "4px 16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: 0.5 }}>⏱ {String(Math.floor(searchElapsed / 60)).padStart(2, "0")}:{String(searchElapsed % 60).padStart(2, "0")}</div>
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

              {orderStatus === "accepted" && acceptedMitra && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#e8f8f2", borderRadius: 14, border: "1.5px solid #b2e8d4" }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a7a6a" }}>Mitra Ditemukan!</div>
                  </div>

                  <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 18, padding: "18px 16px", background: "#fff" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 14, background: "#e8f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, overflow: "hidden" }}>
                        {acceptedMitra.photo ? <img src={acceptedMitra.photo} alt="foto mitra" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : meta.emoji}
                      </div>
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

                    <div style={{ display: "flex", marginBottom: 14, borderTop: "1px solid #f0f4f8", paddingTop: 14 }}>
                      <div style={{ flex: 1, paddingRight: 14 }}>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Estimasi Biaya</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>Rp {acceptedMitra.callFee.toLocaleString("id-ID")}</div>
                      </div>
                      <div style={{ width: 1, background: "#e0e8f0", margin: "0 14px 0 0" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Est. Tiba</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>± {acceptedMitra.etaMin} menit</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "rgba(245,166,35,0.08)", borderRadius: 12, border: "1px solid rgba(245,166,35,0.2)" }}>
                      <span style={{ fontSize: 15 }}>💡</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>Konfirmasi detail dengan mitra</div>
                        <div style={{ fontSize: 11, color: "#92400e", marginTop: 1 }}>Chat dengan mitra sebelum memanggil</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setChatOpen(o => !o)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px", borderRadius: 14, border: "none", background: chatOpen ? "#1a3a5c" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 17 }}>💬</span>
                    Chat dengan Mitra {chatOpen ? "∧" : "∨"}
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
                            <div style={{ fontSize: 12, color: "#b0bec5", textAlign: "center" }}>Mulai diskusi dengan mitra</div>
                          </div>
                        ) : (
                          chatMessages.map(m => {
                            const isMine = m.senderRole === "pengguna";
                            return (
                              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#7a8a9a" }}>{isMine ? "Anda" : acceptedMitra?.name ?? "Mitra"}</span>
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
                        <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: chatInput.trim() ? "linear-gradient(135deg, #1a3a5c, #1a7a6a)" : "#e0e8f0", color: "#fff", fontSize: 16, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
                      </div>
                    </div>
                  )}

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

                  {!mitraConfirmed && (
                    <button
                      onClick={async () => {
                        if (orderId) await fetch(`/api/pengguna/orders/${orderId}`, { method: "DELETE", credentials: "include" }).catch(() => {});
                        if (orderPollRef.current) clearInterval(orderPollRef.current);
                        if (chatPollRef.current) clearInterval(chatPollRef.current);
                        setOrderId(null); setOrderNo(""); setOrderStatus("creating"); setMitraRejectedCount(0);
                        setAcceptedMitra(null); setChatMessages([]); setChatInput(""); setChatOpen(false);
                        setMitraConfirmed(false);
                      }}
                      style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      🔄 Cari Mitra Lain
                    </button>
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
            ) : orderStatus !== "accepted" ? (
              <button disabled style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: "#c0d0dc", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "not-allowed" }}>
                {orderStatus === "creating" ? "Membuat pesanan..." : "Menunggu Mitra Menerima..."}
              </button>
            ) : null}
          </div>
        </>
      )}

      {/* ── STEP 4: TRACKING ── */}
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
                <div style={{ background: "rgba(26,58,92,0.92)", backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                  🕐 {trackEta != null ? `± ${trackEta} menit` : `± ${acceptedMitra.etaMin} menit`}
                </div>
                <div style={{ background: "rgba(26,122,106,0.9)", backdropFilter: "blur(6px)", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" }}>
                  📏 {trackDist != null ? (trackDist < 1 ? `${Math.round(trackDist * 1000)} m` : `${trackDist.toFixed(1)} km`) : `${acceptedMitra.dist < 1 ? `${Math.round(acceptedMitra.dist * 1000)} m` : `${acceptedMitra.dist.toFixed(1)} km`}`}
                </div>
              </div>
              <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 500, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#1a3a5c", display: "flex", alignItems: "center", gap: 6 }}>
                  {meta.emoji} Mitra
                </div>
                <div style={{ background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#e53e3e", display: "flex", alignItems: "center", gap: 6 }}>
                  📍 Titik Jemput
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 16px 0" }}>
              <div style={{ border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", marginBottom: 16, background: "#fff" }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, overflow: "hidden" }}>
                  {acceptedMitra.photo ? <img src={acceptedMitra.photo} alt="foto mitra" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : meta.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a" }}>{acceptedMitra.name}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>✅ Mitra Terverifikasi RIDE</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>
                    {acceptedMitra.rating != null ? `⭐ ${acceptedMitra.rating}` : "⭐ Baru"} · {acceptedMitra.totalOrders} order
                  </div>
                </div>
                <button onClick={() => setChatOpen(o => !o)} style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px solid #1a3a5c", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>💬 Chat</button>
              </div>

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
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#7a8a9a" }}>{isMine ? "Anda" : acceptedMitra?.name ?? "Mitra"}</span>
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

              {/* ── STATUS WARUNG (gofood) ── */}
              <div style={{ background: "#fff", border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>🏪 Status Warung</div>
                {merchantStatus === "ditolak" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "#fff5f5", border: "1px solid #f5c6c6", borderRadius: 12 }}>
                    <span style={{ fontSize: 18 }}>❌</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#c0392b" }}>Warung menolak pesanan</div>
                      <div style={{ fontSize: 12, color: "#a04a44", marginTop: 2, lineHeight: 1.4 }}>Maaf, warung tidak dapat memproses pesanan ini. Pesanan dibatalkan.</div>
                    </div>
                  </div>
                ) : (() => {
                  const wOrder = ["menunggu", "diterima", "siap"];
                  const curIdx = wOrder.indexOf(merchantStatus);
                  return [
                    { label: "Menunggu konfirmasi warung", key: "menunggu" },
                    { label: "Warung sedang menyiapkan makanan", key: "diterima" },
                    { label: "Makanan siap, ojol menuju lokasi", key: "siap" },
                  ].map((ph, i, arr) => {
                    const phIdx = wOrder.indexOf(ph.key);
                    const done = phIdx < curIdx;
                    const active = phIdx === curIdx;
                    return (
                      <div key={ph.key} style={{ display: "flex", gap: 14 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, background: done ? "#1a7a6a" : active ? "#1a3a5c" : "#e0e8f0", display: "flex", alignItems: "center", justifyContent: "center", border: active ? "2px solid #1a7a6a" : "none" }}>
                            {done ? <span style={{ color: "#fff", fontSize: 11 }}>✓</span>
                              : active ? <div style={{ width: 7, height: 7, borderRadius: 4, background: "#1a7a6a" }} />
                              : <div style={{ width: 6, height: 6, borderRadius: 3, background: "#c0d0dc" }} />}
                          </div>
                          {i < arr.length - 1 && <div style={{ width: 2, height: 24, background: "#e0e8f0", margin: "3px 0" }} />}
                        </div>
                        <div style={{ paddingBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "#1a2a3a" : "#9aa5b4" }}>{ph.label}</div>
                          {active && <div style={{ fontSize: 11, color: "#1a7a6a", fontWeight: 600, marginTop: 1 }}>• Sekarang</div>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div style={{ background: "#fff", border: "1.5px solid #e0e8f0", borderRadius: 16, padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>📍 Status Perjalanan</div>
                {(() => {
                  const phaseOrder = ["menuju", "tiba", "pengerjaan", "selesai"];
                  const curIdx = phaseOrder.indexOf(trackingPhase);
                  return [
                    { label: "Mitra menuju titik jemput", key: "menuju" },
                    { label: "Mitra sudah tiba", key: "tiba" },
                    { label: "Perjalanan berlangsung", key: "pengerjaan" },
                    { label: "Selesai ✅", key: "selesai" },
                  ].map((ph) => {
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
              <button onClick={() => navigate("/dashboard/pengguna")} style={{ flex: 1, padding: "15px", borderRadius: 16, border: "1.5px solid #e0e8f0", background: "#fff", color: "#4a5568", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Kembali</button>
              <button disabled style={{ flex: 2, padding: "15px", borderRadius: 16, border: "none", background: "#d0d8e0", color: "#a0aab4", fontWeight: 700, fontSize: 15, cursor: "not-allowed" }}>Lanjut →</button>
            </div>
          </div>
        </>
      )}

      {/* ── STEP 5: BAYAR ── */}
      {step === 5 && (() => {
        const fmtIdr = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
        const discountAmt = voucherDiscount;
        const finalTotal = paymentData ? Math.max(0, paymentData.total - discountAmt) : 0;
        const pmLabel: Record<string, string> = { cash: "Bayar Tunai ke Mitra", transfer: "Transfer Bank", qris: "Bayar via QRIS" };
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
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>💳 Pembayaran</div>

                <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 14, padding: "12px 16px", marginBottom: 16, textAlign: "center" as const }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a" }}>✅ Layanan Selesai!</div>
                  <div style={{ fontSize: 12, color: "#4a9a7a", marginTop: 3 }}>Silakan selesaikan pembayaran</div>
                </div>

                {!paymentData && (
                  <div style={{ background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e0e8f0", padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Menunggu mitra mengisi rincian biaya...</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4" }}>Mitra sedang mempersiapkan data pembayaran untuk Anda</div>
                  </div>
                )}

                {paymentData && !paymentConfirmed && (
                  <>
                    <div style={{ borderRadius: 14, border: "1.5px solid #e0e8f0", overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ background: "#f8fafc", padding: "10px 16px", fontSize: 11, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1 }}>RINCIAN BIAYA</div>
                      {[
                        { label: "Biaya Panggilan", val: paymentData.biayaPanggilan },
                        ...(paymentData.biayaJasa > 0 ? [{ label: "Biaya Jasa", val: paymentData.biayaJasa }] : []),
                        ...(paymentData.biayaSparepart > 0 ? [{ label: "Harga Makanan (ditalangi ojol)", val: paymentData.biayaSparepart }] : []),
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

                    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0e8f0", padding: "14px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>🎁 Kode Voucher</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={voucherCode} onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherDiscount(0); setVoucherMsg(""); }} placeholder="Contoh: RIDE10" style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", fontWeight: 600 }} />
                        <button
                          onClick={async () => { if (!voucherCode || !paymentData) return; try { const r = await fetch(`/api/pengguna/vouchers/check?code=${encodeURIComponent(voucherCode)}&total=${paymentData.total}`, { credentials: "include" }); const d = await r.json(); if (d.valid) { setVoucherDiscount(d.discount); setVoucherMsg(`✅ Diskon ${fmtIdr(d.discount)}`); } else { setVoucherDiscount(0); setVoucherMsg(`❌ ${d.error}`); } } catch { setVoucherMsg("❌ Gagal cek voucher"); } }}
                          style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Pakai</button>
                      </div>
                      {voucherMsg && <div style={{ fontSize: 11, color: voucherMsg.startsWith("✅") ? "#1a7a6a" : "#dc2626", fontWeight: 600, marginTop: 6 }}>{voucherMsg}</div>}
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>Metode Pembayaran</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        {(["cash", "transfer", "qris"] as const).map(m => (
                          <button key={m} onClick={() => setPaymentMethodUser(m)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: selectedMethod === m ? "2px solid #1a7a6a" : "1.5px solid #e0e8f0", background: selectedMethod === m ? "#f0faf7" : "#fff", color: selectedMethod === m ? "#1a7a6a" : "#7a8a9a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
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

                {paymentConfirmed && orderStatus !== "done" && (
                  <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 16, padding: "20px 16px", textAlign: "center" as const, marginBottom: 16 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>⏳</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>Menunggu Konfirmasi Mitra</div>
                    <div style={{ fontSize: 12, color: "#b45309" }}>Pembayaran kamu sudah tercatat. Mitra akan segera mengkonfirmasi penerimaan pembayaran.</div>
                  </div>
                )}

                {orderStatus === "done" && paymentConfirmed && (
                  <div style={{ background: "#f0faf7", border: "1.5px solid #b6e6d7", borderRadius: 16, padding: "24px 16px", textAlign: "center" as const, marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a6a", marginBottom: 6 }}>Pembayaran Berhasil!</div>
                    <div style={{ fontSize: 12, color: "#4a9a7a" }}>Terima kasih telah menggunakan RIDE</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center" }}>
                      <button onClick={() => setShowReviewModal(true)} style={{ padding: "10px 22px", borderRadius: 12, border: "2px solid #f59e0b", background: "#fff", color: "#d97706", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        ⭐ Beri Ulasan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 14px 28px", background: "#fff", borderTop: "1px solid #e8f0f8", zIndex: 100 }}>
              {!paymentData && (
                <button disabled style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#e0e8f0", color: "#9aa5b4", fontWeight: 700, fontSize: 15 }}>
                  ⏳ Menunggu data pembayaran...
                </button>
              )}
              {paymentData && !paymentConfirmed && (
                <button
                  onClick={async () => {
                    try {
                      const method = paymentMethodUser ?? paymentData?.paymentMethod ?? "cash";
                      await fetch(`/api/pengguna/orders/${orderId}/confirm-payment`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ paymentMethod: method, voucherCode: voucherCode || null }),
                      });
                      setPaymentConfirmed(true);
                    } catch { alert("Gagal konfirmasi. Coba lagi."); }
                  }}
                  style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  ✅ Konfirmasi Pembayaran
                </button>
              )}
              {paymentConfirmed && orderStatus !== "done" && (
                <button disabled style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#fef3c7", color: "#92400e", fontWeight: 700, fontSize: 14, cursor: "default" }}>
                  ⏳ Pembayaran terkirim, menunggu konfirmasi mitra...
                </button>
              )}
              {orderStatus === "done" && (
                <button onClick={() => navigate("/dashboard/pengguna")} style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: "#f0f4f8", color: "#4a5a6a", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  ← Kembali ke Dashboard
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
