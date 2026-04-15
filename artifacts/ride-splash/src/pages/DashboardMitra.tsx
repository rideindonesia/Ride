import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number | null | undefined) {
  if (n == null) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "jt";
  if (n >= 1000) return Math.round(n / 1000) + "rb";
  return n.toString();
}

function fmtRp(n: number | null | undefined) {
  if (n == null) return "Rp 0";
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

interface ChartBar { label: string; value: number }

function BarChart({ data, activeIndex }: { data: ChartBar[]; activeIndex: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, paddingTop: 24 }}>
      {data.map((d, i) => {
        const pct = max > 0 ? d.value / max : 0;
        const h = Math.max(pct * 80, d.value > 0 ? 8 : 4);
        const isActive = i === activeIndex;
        return (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {d.value > 0 && (
              <span style={{ fontSize: 9, color: "#7a8a9a", whiteSpace: "nowrap" }}>{fmt(d.value)}</span>
            )}
            <div style={{ width: "100%", height: h, borderRadius: "6px 6px 0 0", background: isActive ? "linear-gradient(180deg, #f5a623, #ea8c00)" : "linear-gradient(180deg, #1a7a6a, #1a3a5c)" }} />
            <span style={{ fontSize: 9, color: "#7a8a9a" }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface DashData {
  name: string;
  serviceType: string;
  isOnline: boolean;
  todayIncome: number;
  todayOrders: number;
  rating: number;
  platformFeeStatus: string;
  platformFeePending: number;
  weeklyChart: ChartBar[];
  weeklyTotal: number;
  weeklyBest: number;
  monthlyChart: ChartBar[];
  recentOrders: {
    id: number; orderNo: string; vehicleModel: string; vehicleYear: string;
    totalAmount: number; platformFee: number; penggunaName: string; createdAt: string;
  }[];
  platformFeeHistory: {
    weekStart: string; weekEnd: string; omset: number; fee: number; isPaid: boolean;
  }[];
}

interface IncomingOrder {
  id: number; orderNo: string; serviceType: string; vehicleType: string;
  vehicleModel: string; vehicleYear: string; damageCategories: string[];
  pickupAddress: string; pickupLat: number | null; pickupLng: number | null;
  totalAmount: number; platformFee: number;
  penggunaName: string; createdAt: string;
}

interface Notif {
  id: string;
  type: "order" | "chat" | "system";
  icon: string;
  title: string;
  body: string;
  time: Date;
  read: boolean;
  orderId?: number;
}

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Baru saja";
  if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return Math.floor(s / 86400) + " hari lalu";
}

const SERVICE_CONFIG: Record<string, {
  emoji: string; header: string; mulai: string; selesai: string;
  foto: string; jasaLabel: string; jasaSub: string;
  showSparepart: boolean; sparepartLabel: string; sparepartSub: string;
}> = {
  bengkel:    { emoji: "🔧", header: "Bengkel Panggilan", mulai: "🔧 Mulai Perbaikan",  selesai: "✅ Perbaikan Selesai", foto: "Foto Bukti Perbaikan", jasaLabel: "Biaya Jasa Bengkel",      jasaSub: "Ongkos perbaikan",            showSparepart: true,  sparepartLabel: "Biaya Sparepart",  sparepartSub: "Suku cadang yang diganti" },
  elektronik: { emoji: "💡", header: "Service Elektronik", mulai: "💡 Mulai Servis",    selesai: "✅ Servis Selesai",    foto: "Foto Bukti Servis",    jasaLabel: "Biaya Jasa Servis",        jasaSub: "Ongkos perbaikan elektronik", showSparepart: true,  sparepartLabel: "Biaya Komponen",   sparepartSub: "Part/komponen yang diganti" },
  cuci:       { emoji: "🚿", header: "Cuci Kendaraan",     mulai: "🚿 Mulai Cuci",      selesai: "✅ Cuci Selesai",      foto: "Foto Hasil Cuci",       jasaLabel: "Biaya Jasa Cuci",          jasaSub: "Ongkos cuci kendaraan",       showSparepart: true,  sparepartLabel: "Biaya Produk",     sparepartSub: "Sabun/wax/poles (opsional)" },
  barber:     { emoji: "✂️", header: "Pangkas Rambut",     mulai: "✂️ Mulai Pangkas",   selesai: "✅ Pangkas Selesai",   foto: "Foto Hasil Pangkas",    jasaLabel: "Biaya Jasa Pangkas",       jasaSub: "Ongkos pangkas rambut",       showSparepart: false, sparepartLabel: "",                 sparepartSub: "" },
  inspeksi:   { emoji: "🔍", header: "Inspeksi Kendaraan", mulai: "🔍 Mulai Inspeksi",  selesai: "✅ Inspeksi Selesai",  foto: "Foto Hasil Inspeksi",   jasaLabel: "Biaya Laporan Inspeksi",   jasaSub: "Ongkos inspeksi kendaraan",   showSparepart: false, sparepartLabel: "",                 sparepartSub: "" },
  towing:     { emoji: "🚐", header: "Towing / Derek",     mulai: "🚐 Mulai Derek",     selesai: "✅ Kendaraan Tiba",    foto: "Foto Bukti Derek",      jasaLabel: "Biaya Jasa Derek",         jasaSub: "Tarif derek kendaraan",       showSparepart: false, sparepartLabel: "",                 sparepartSub: "" },
};

function getSvcCfg(serviceType?: string | null) {
  return SERVICE_CONFIG[serviceType ?? "bengkel"] ?? SERVICE_CONFIG["bengkel"];
}

export default function DashboardMitra() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"minggu" | "bulan">("minggu");
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [incoming, setIncoming] = useState<IncomingOrder | null>(null);
  const [incomingTimer, setIncomingTimer] = useState(30);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const seenOrderIds = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active order (after accepting) with chat
  const [activeOrder, setActiveOrder] = useState<IncomingOrder | null>(null);
  type ChatMsg = { id: number; senderRole: string; message: string; createdAt: string };
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Mitra order phase: diterima → chat → menuju → tiba → pengerjaan → selesai
  type MitraPhase = "diterima" | "chat" | "menuju" | "tiba" | "pengerjaan" | "selesai";
  const [mitraPhase, setMitraPhase] = useState<MitraPhase>("diterima");
  const [etaSecs, setEtaSecs] = useState(0);
  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [biayaJasa, setBiayaJasa] = useState("");
  const [biayaSparepart, setBiayaSparepart] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash"|"transfer"|"qris">("cash");
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [rincianSent, setRincianSent] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/mitra/dashboard`);
      if (res.status === 401) { navigate("/login/form?role=mitra"); return; }
      const d = await res.json();
      setData(d);
      setIsOnline(d.isOnline ?? false);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [navigate]);

  // Restore active order dari DB (untuk kasus reload halaman)
  const fetchActiveOrder = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/mitra/active-order`, { credentials: "include" });
      if (!res.ok) return;
      const d = await res.json();
      if (!d.order) return;
      const o = d.order;
      // Jangan override kalau sudah ada activeOrder (mitra baru saja accept)
      setActiveOrder(prev => prev ? prev : o);
      // Restore phase dari DB
      const phaseMap: Record<string, string> = { menuju: "menuju", tiba: "tiba", pengerjaan: "pengerjaan", selesai: "selesai" };
      const dbPhase = phaseMap[o.trackingPhase ?? ""] ?? "diterima";
      setMitraPhase(prev => prev !== "diterima" ? prev : dbPhase as any);
      // Restore paymentData & rincianSent kalau sudah pernah kirim
      if (o.paymentData) {
        setBiayaJasa(String(o.paymentData.biayaJasa ?? ""));
        setBiayaSparepart(String(o.paymentData.biayaSparepart ?? "0"));
        setPaymentMethod(o.paymentData.paymentMethod ?? "cash");
        setRincianSent(true);
      }
    } catch { /* ignore */ }
  }, []);

  const pushNotif = useCallback((n: Omit<Notif, "id" | "time" | "read">) => {
    setNotifs(prev => [{ ...n, id: Date.now().toString(), time: new Date(), read: false }, ...prev].slice(0, 50));
  }, []);

  const fetchIncoming = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/mitra/incoming-orders`);
      if (!res.ok) return;
      const d = await res.json();
      if (d.incoming && !seenOrderIds.current.has(d.incoming.id)) {
        seenOrderIds.current.add(d.incoming.id);
        setIncoming(d.incoming);
        setIncomingTimer(30);
        pushNotif({
          type: "order",
          icon: getSvcCfg(d.incoming.serviceType).emoji,
          title: "Pesanan Masuk!",
          body: `${d.incoming.penggunaName} — ${d.incoming.vehicleModel} ${d.incoming.vehicleYear}`,
          orderId: d.incoming.id,
        });
      }
    } catch { /* ignore */ }
  }, [pushNotif]);

  useEffect(() => {
    fetchDashboard();
    fetchIncoming();
    fetchActiveOrder();
    pollRef.current = setInterval(() => {
      fetchDashboard();
      fetchIncoming();
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchDashboard, fetchIncoming, fetchActiveOrder]);

  // Countdown timer for incoming order
  useEffect(() => {
    if (!incoming) return;
    timerRef.current = setInterval(() => {
      setIncomingTimer(t => {
        if (t <= 1) { setIncoming(null); return 30; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [incoming?.id]);

  const toggleOnline = async () => {
    setTogglingOnline(true);
    const next = !isOnline;
    setIsOnline(next);
    try {
      let lat: number | undefined, lng: number | undefined;
      if (next && navigator.geolocation) {
        await new Promise<void>(resolve => {
          navigator.geolocation.getCurrentPosition(
            pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 4000 }
          );
        });
      }
      await fetch(`${BASE}/api/mitra/toggle-online`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: next, lat, lng }),
      });
    } catch { setIsOnline(!next); }
    finally { setTogglingOnline(false); }
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, read: true })));

  // Poll chat messages when active order accepted
  useEffect(() => {
    if (!activeOrder) return;
    const fetchMsgs = async () => {
      try {
        const res = await fetch(`${BASE}/api/chat/${activeOrder.id}`, { credentials: "include" });
        const data = await res.json();
        setChatMsgs(data.messages ?? []);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } catch { /* ignore */ }
    };
    fetchMsgs();
    chatPollRef.current = setInterval(fetchMsgs, 3000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [activeOrder?.id]);

  const sendChat = async () => {
    if (!chatInput.trim() || !activeOrder || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      await fetch(`${BASE}/api/chat/${activeOrder.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      });
    } catch { /* ignore */ } finally { setChatSending(false); }
  };

  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const updatePhase = async (phase: string) => {
    if (!activeOrder) return;
    await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/phase`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
  };

  const acceptOrder = async (orderId: number) => {
    await fetch(`${BASE}/api/mitra/orders/${orderId}/accept`, { method: "PATCH" });
    const current = incoming;
    setIncoming(null);
    if (current) {
      setActiveOrder(current);
      setChatMsgs([]);
      setChatOpen(false);
      setMitraPhase("diterima");
    }
    pushNotif({ type: "system", icon: "✅", title: "Pesanan Diterima", body: "Anda telah menerima pesanan. Segera menuju lokasi pelanggan." });
    fetchDashboard();
  };

  const rejectOrder = async (orderId: number) => {
    await fetch(`${BASE}/api/mitra/orders/${orderId}/reject`, { method: "PATCH" });
    setIncoming(null);
    pushNotif({ type: "system", icon: "❌", title: "Pesanan Ditolak", body: "Pesanan telah ditolak dan dikembalikan ke antrian." });
  };

  const completeOrder = async () => {
    if (!activeOrder) return;
    await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/done`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    setActiveOrder(null);
    setChatMsgs([]);
    setMitraPhase("diterima");
    setEtaSecs(0);
    setBiayaJasa(""); setBiayaSparepart("0"); setPaymentMethod("cash");
    setProofPhoto(null); setProofPreview(null); setRincianSent(false);
    pushNotif({ type: "system", icon: "🎉", title: "Pekerjaan Selesai", body: "Pesanan telah diselesaikan." });
    fetchDashboard();
  };

  const startJourney = async () => {
    if (!activeOrder) return;
    await updatePhase("menuju");
    // Hitung ETA dari mitra location → pickup location
    // Gunakan mitra lat/lng dari data yang disimpan (data?.lat/lng) atau default estimasi 5 menit = 300 detik
    const mitraLat = (activeOrder as any).mitraLat as number | null;
    const mitraLng = (activeOrder as any).mitraLng as number | null;
    const pLat = activeOrder.pickupLat;
    const pLng = activeOrder.pickupLng;
    let secs = 300; // default 5 menit
    if (mitraLat && mitraLng && pLat && pLng) {
      const km = haversineKm(mitraLat, mitraLng, pLat, pLng);
      secs = Math.max(60, Math.round(km / 40 * 3600)); // 40 km/jam
    }
    setEtaSecs(secs);
    setMitraPhase("menuju");
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    etaTimerRef.current = setInterval(() => {
      setEtaSecs(prev => {
        if (prev <= 1) { clearInterval(etaTimerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const serviceLabel = (s: string) => {
    const cfg = getSvcCfg(s);
    return `${cfg.emoji} ${cfg.header}`;
  };

  const chartData = chartMode === "minggu" ? (data?.weeklyChart ?? []) : (data?.monthlyChart ?? []);
  const todayIdx = chartMode === "minggu" ? (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) : -1;

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)" }}>
        <div style={{ color: "#fff", fontSize: 16 }}>Memuat...</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f0f4f8", overflow: "hidden", position: "relative" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 14px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Avatar */}
          <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {(data?.name ?? "M").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 500 }}>Dashboard Mitra</div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{data?.name ?? ""}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>{serviceLabel(data?.serviceType ?? "bengkel")}</div>
          </div>
          {/* Bell */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowNotif(v => !v); if (!showNotif) markAllRead(); }}
              style={{ width: 44, height: 44, borderRadius: 14, background: showNotif ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, cursor: "pointer" }}
            >
              🔔
            </button>
            {unreadCount > 0 && (
              <div style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", padding: "0 4px" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </div>
        </div>

        {/* Status Order card */}
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 18px", border: "1.5px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Status Order</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: isOnline ? "#22c55e" : "#ef4444" }} />
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{isOnline ? "Online — Menerima pesanan" : "Offline"}</span>
              </div>
            </div>
            {/* Toggle switch */}
            <button
              onClick={toggleOnline}
              disabled={togglingOnline}
              style={{
                width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                background: isOnline ? "#22c55e" : "rgba(255,255,255,0.2)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: isOnline ? 26 : 3,
                width: 22, height: 22, borderRadius: 11, background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Notification Panel Overlay */}
      {showNotif && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400 }} onClick={() => setShowNotif(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#fff", borderRadius: "0 0 24px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            {/* Panel header */}
            <div style={{ background: "linear-gradient(135deg, #0d2137, #1a3a5c)", padding: "50px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>🔔 Notifikasi</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>
                  {notifs.length === 0 ? "Tidak ada notifikasi" : `${notifs.length} notifikasi`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {notifs.length > 0 && (
                  <button
                    onClick={() => { setNotifs([]); }}
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                  >
                    Hapus semua
                  </button>
                )}
                <button
                  onClick={() => setShowNotif(false)}
                  style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Notif list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔕</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 4 }}>Belum ada notifikasi</div>
                  <div style={{ fontSize: 13, color: "#9aa5b4" }}>Notifikasi pesanan & chat akan muncul di sini</div>
                </div>
              ) : (
                notifs.map((n, i) => (
                  <div key={n.id}>
                    {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "0 16px" }} />}
                    <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: n.read ? "#fff" : "rgba(26,122,106,0.04)", alignItems: "flex-start" }}>
                      {/* Icon bubble */}
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: n.type === "order" ? "rgba(234,88,12,0.1)" : n.type === "chat" ? "rgba(59,130,246,0.1)" : "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                        {n.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{n.title}</div>
                          {!n.read && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#ea580c", flexShrink: 0, marginTop: 4 }} />}
                        </div>
                        <div style={{ fontSize: 12, color: "#4a5568", marginTop: 3, lineHeight: 1.4 }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 4 }}>{timeAgo(n.time)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom categories hint */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f4f8", display: "flex", gap: 8, flexShrink: 0 }}>
              {[{ icon: "🔧", label: "Order", color: "#ea580c" }, { icon: "💬", label: "Chat", color: "#3b82f6" }, { icon: "📢", label: "Info", color: "#1a7a6a" }].map(c => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#f8fafc", borderRadius: 20, border: "1px solid #e8f0f8" }}>
                  <span style={{ fontSize: 12 }}>{c.icon}</span>
                  <span style={{ fontSize: 11, color: c.color, fontWeight: 600 }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 90px" }}>

        {/* Active Order card — chat dengan pengguna setelah terima */}
        {activeOrder && (() => {
          const svcCfg = getSvcCfg(activeOrder.serviceType);
          const badgeLabel: Record<string, string> = {
            diterima: "Diterima", chat: "Chat & Negosiasi",
            menuju: "Menuju Lokasi", tiba: "Sudah Tiba", pengerjaan: "Pengerjaan", selesai: "Pembayaran",
          };
          const etaMM = String(Math.floor(etaSecs / 60)).padStart(2, "0");
          const etaSS = String(etaSecs % 60).padStart(2, "0");
          return (
            <div style={{ marginBottom: 16, background: "#f0faf7", borderRadius: 20, boxShadow: "0 4px 20px rgba(26,122,106,0.14)", border: "2px solid #1a7a6a", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 10px" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>{svcCfg.emoji} Order Aktif — {svcCfg.header}</span>
                <span style={{ background: "#1a7a6a", color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>
                  {badgeLabel[mitraPhase] ?? "Aktif"}
                </span>
              </div>

              {/* Customer + vehicle */}
              <div style={{ padding: "0 10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📍</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>
                  {activeOrder.penggunaName} · {activeOrder.vehicleModel} {activeOrder.vehicleYear}
                </span>
              </div>

              <div style={{ padding: "0 10px 16px" }}>

                {/* ── FASE 1: Diterima ── */}
                {mitraPhase === "diterima" && (
                  <>
                    <div style={{ background: "#d4f5ec", borderRadius: 14, padding: "12px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 16 }}>💬</span>
                      <span style={{ fontSize: 13, color: "#1a5a4a", fontWeight: 600, lineHeight: 1.4 }}>
                        Diskusikan biaya jasa dengan konsumen sebelum berangkat
                      </span>
                    </div>
                    <button
                      onClick={() => { setMitraPhase("chat"); setChatOpen(true); }}
                      style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      💬 Chat dengan Konsumen
                    </button>
                  </>
                )}

                {/* ── FASE 2: Chat & Negosiasi ── */}
                {mitraPhase === "chat" && (
                  <>
                    {/* Chat panel */}
                    <div style={{ border: "1.5px solid #cce8df", borderRadius: 14, overflow: "hidden", marginBottom: 12, background: "#fff" }}>
                      <div style={{ padding: "10px 14px 6px", fontWeight: 700, fontSize: 13, color: "#1a5a4a", borderBottom: "1px solid #e8f5f1" }}>
                        💬 Chat dengan {activeOrder.penggunaName}
                      </div>
                      <div style={{ minHeight: 140, maxHeight: 200, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: 6, background: "#fafcff" }}>
                        {chatMsgs.length === 0 ? (
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "16px 0" }}>
                            <span style={{ fontSize: 28, opacity: 0.3 }}>💬</span>
                            <div style={{ fontSize: 11, color: "#b0bec5" }}>Mulai diskusi dengan pelanggan</div>
                          </div>
                        ) : (
                          chatMsgs.map(m => {
                            const isMine = m.senderRole === "mitra";
                            return (
                              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start" }}>
                                <div style={{ maxWidth: "78%", padding: "8px 12px", borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isMine ? "linear-gradient(135deg, #1a7a6a, #1a3a5c)" : "#f0f4f8", color: isMine ? "#fff" : "#1a2a3a", fontSize: 12, lineHeight: 1.4 }}>
                                  {m.message}
                                </div>
                                <div style={{ fontSize: 10, color: "#b0bec5", marginTop: 1 }}>
                                  {new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={chatBottomRef} />
                      </div>
                      <div style={{ display: "flex", gap: 6, padding: "8px 10px", background: "#f8fafc", borderTop: "1px solid #f0f4f8" }}>
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && sendChat()}
                          placeholder="Ketik pesan..."
                          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e0e8f0", fontSize: 12, outline: "none", background: "#fff" }}
                        />
                        <button
                          onClick={sendChat}
                          disabled={!chatInput.trim() || chatSending}
                          style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: chatInput.trim() ? "linear-gradient(135deg, #1a7a6a, #1a3a5c)" : "#e0e8f0", color: "#fff", fontSize: 14, cursor: chatInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                        >➤</button>
                      </div>
                    </div>
                    {/* Hint konsumen setuju */}
                    <div style={{ background: "#fff8e1", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 15 }}>👋</span>
                      <span style={{ fontSize: 12, color: "#7a5a00", fontWeight: 600 }}>Konsumen setuju! Siap berangkat.</span>
                    </div>
                    <button
                      onClick={startJourney}
                      style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      🚗 Mulai Perjalanan
                    </button>
                  </>
                )}

                {/* ── FASE 3: Menuju Lokasi ── */}
                {mitraPhase === "menuju" && (
                  <>
                    <div style={{ background: "#fff", borderRadius: 16, padding: "14px", marginBottom: 12, border: "1.5px solid #d4ede5" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#7a8a9a", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            ⏱ Estimasi Tiba
                          </div>
                          <div style={{ fontSize: 30, fontWeight: 800, color: "#1a7a6a", marginTop: 4 }}>
                            {etaMM}:{etaSS}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => {
                              const lat = activeOrder.pickupLat;
                              const lng = activeOrder.pickupLng;
                              if (lat && lng) window.open(`https://maps.google.com/?daddr=${lat},${lng}`, "_blank");
                            }}
                            style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                          >
                            🗺️ Maps
                          </button>
                          <button
                            onClick={() => {
                              const lat = activeOrder.pickupLat;
                              const lng = activeOrder.pickupLng;
                              if (lat && lng) window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, "_blank");
                            }}
                            style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: "#0077cc", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Waze
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await updatePhase("tiba");
                        if (etaTimerRef.current) clearInterval(etaTimerRef.current);
                        setMitraPhase("tiba");
                      }}
                      style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      📍 Sudah Tiba
                    </button>
                  </>
                )}

                {/* ── FASE 4: Sudah Tiba ── */}
                {mitraPhase === "tiba" && (
                  <button
                    onClick={async () => { await updatePhase("pengerjaan"); setMitraPhase("pengerjaan"); }}
                    style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {svcCfg.mulai}
                  </button>
                )}

                {/* ── FASE 5: Pengerjaan ── */}
                {mitraPhase === "pengerjaan" && (
                  <button
                    onClick={async () => { await updatePhase("selesai"); setMitraPhase("selesai"); }}
                    style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {svcCfg.selesai}
                  </button>
                )}

                {/* ── FASE 6: Pembayaran Final (inline form) ── */}
                {mitraPhase === "selesai" && (() => {
                  const jasa = Number(biayaJasa) || 0;
                  const spare = svcCfg.showSparepart ? (Number(biayaSparepart) || 0) : 0;
                  const biayaPanggilan = activeOrder.totalAmount ?? 0;
                  const biayaLayanan = Math.round(jasa * 0.05 / 1000) * 1000;
                  const total = jasa + spare + biayaPanggilan + biayaLayanan;
                  const canSend = jasa > 0;
                  const fmtIdr = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

                  const kirimRincian = async () => {
                    if (!activeOrder || !canSend) return;
                    try {
                      // Simpan paymentData ke DB agar pengguna bisa lihat breakdown
                      const r = await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/payment-data`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ biayaJasa: jasa, biayaSparepart: spare, biayaPanggilan, biayaLayanan, total, paymentMethod }),
                      });
                      if (!r.ok) throw new Error("Gagal simpan");
                      // Kirim juga notifikasi via chat
                      const spareLine = svcCfg.showSparepart && spare > 0 ? `\n• ${svcCfg.sparepartLabel}: ${fmtIdr(spare)}` : "";
                      const msg = `📋 Rincian Biaya:\n• ${svcCfg.jasaLabel}: ${fmtIdr(jasa)}${spareLine}\n• Biaya Panggilan: ${fmtIdr(biayaPanggilan)}\n• Biaya Layanan & Admin: ${fmtIdr(biayaLayanan)}\n• Total: ${fmtIdr(total)}\nMetode bayar: ${paymentMethod.toUpperCase()}`;
                      await fetch(`${BASE}/api/chat/${activeOrder.id}`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        credentials: "include", body: JSON.stringify({ message: msg }),
                      });
                      setRincianSent(true);
                      pushNotif({ type: "chat", icon: "📋", title: "Rincian Terkirim", body: "Rincian biaya sudah dikirim ke konsumen." });
                    } catch {
                      alert("Gagal mengirim rincian. Periksa koneksi dan coba lagi.");
                    }
                  };

                  const konfirmasiSelesai = async () => {
                    if (!activeOrder) return;
                    await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/done`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ totalAmount: total, paymentMethod }),
                    });
                    if (chatPollRef.current) clearInterval(chatPollRef.current);
                    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
                    setActiveOrder(null); setChatMsgs([]); setMitraPhase("diterima"); setEtaSecs(0);
                    setBiayaJasa(""); setBiayaSparepart("0"); setPaymentMethod("cash");
                    setProofPhoto(null); setProofPreview(null); setRincianSent(false);
                    pushNotif({ type: "system", icon: "🎉", title: "Pembayaran Selesai", body: `Total: ${fmtIdr(total)}` });
                    fetchDashboard();
                  };

                  return (
                    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0e8f0", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>💳 Data Pembayaran Final</div>

                      {/* Foto Bukti (opsional) */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 8 }}>
                          📸 {svcCfg.foto} <span style={{ fontSize: 12, color: "#9aa5b4", fontWeight: 500 }}>(opsional)</span>
                        </div>
                        <label style={{ display: "block", cursor: "pointer" }}>
                          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                            onChange={e => {
                              const f = e.target.files?.[0] ?? null;
                              setProofPhoto(f);
                              if (f) { const r = new FileReader(); r.onload = ev => setProofPreview(ev.target?.result as string); r.readAsDataURL(f); }
                              else setProofPreview(null);
                            }}
                          />
                          <div style={{ border: "2px dashed #d0dde8", borderRadius: 14, background: "#f5f9fc", minHeight: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" }}>
                            {proofPreview
                              ? <img src={proofPreview} alt="bukti" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 12 }} />
                              : <><span style={{ fontSize: 28, opacity: 0.4 }}>📷</span><span style={{ fontSize: 12, color: "#b0bec5" }}>{svcCfg.foto}</span></>}
                          </div>
                        </label>
                      </div>

                      {/* Biaya inputs */}
                      <div style={{ display: "grid", gridTemplateColumns: svcCfg.showSparepart ? "1fr 1fr" : "1fr", gap: 12 }}>
                        {[
                          { label: svcCfg.jasaLabel, sub: svcCfg.jasaSub, val: biayaJasa, set: setBiayaJasa, show: true },
                          { label: svcCfg.sparepartLabel, sub: svcCfg.sparepartSub, val: biayaSparepart, set: setBiayaSparepart, show: svcCfg.showSparepart },
                        ].filter(f => f.show).map(({ label, sub, val, set }) => (
                          <div key={label}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a", marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 10, color: "#9aa5b4", marginBottom: 6 }}>{sub}</div>
                            <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e0e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                              <span style={{ padding: "0 8px", fontSize: 12, color: "#9aa5b4", background: "#f8fafc", borderRight: "1px solid #e0e8f0", alignSelf: "stretch", display: "flex", alignItems: "center" }}>Rp</span>
                              <input type="number" inputMode="numeric" value={val} onChange={e => { set(e.target.value); setRincianSent(false); }}
                                style={{ flex: 1, padding: "10px 8px", border: "none", outline: "none", fontSize: 14, fontWeight: 700, color: "#1a2a3a", width: 0 }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Breakdown */}
                      <div style={{ borderRadius: 12, border: "1px solid #eef2f7", overflow: "hidden" }}>
                        {[
                          { label: svcCfg.jasaLabel, val: jasa },
                          ...(svcCfg.showSparepart && spare > 0 ? [{ label: svcCfg.sparepartLabel, val: spare }] : []),
                          { label: "Biaya Panggilan", val: biayaPanggilan },
                          { label: "Biaya Layanan & Admin", val: biayaLayanan },
                        ].map(row => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid #f0f4f8" }}>
                            <span style={{ fontSize: 13, color: "#4a5a6a" }}>{row.label}</span>
                            <span style={{ fontSize: 13, color: "#4a5a6a" }}>{fmtIdr(row.val)}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#f8fcfb" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total Tagihan Konsumen</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#1a7a6a" }}>{fmtIdr(total)}</span>
                        </div>
                      </div>

                      {/* Metode Bayar */}
                      <div>
                        <div style={{ fontSize: 13, color: "#7a8a9a", marginBottom: 8 }}>Metode Bayar Konsumen</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {(["cash", "transfer", "qris"] as const).map(m => (
                            <button key={m} onClick={() => setPaymentMethod(m)}
                              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: paymentMethod === m ? "2px solid #ea580c" : "1.5px solid #e0e8f0", background: paymentMethod === m ? "#fff5f0" : "#fff", color: paymentMethod === m ? "#ea580c" : "#7a8a9a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                              {m === "cash" ? "Cash" : m === "transfer" ? "Transfer" : "QRIS"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tombol dua tahap */}
                      {!rincianSent ? (
                        <button disabled={!canSend} onClick={kirimRincian}
                          style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: canSend ? "linear-gradient(135deg, #1a3a5c, #1a7a6a)" : "#e0e8f0", color: canSend ? "#fff" : "#9aa5b4", fontWeight: 700, fontSize: 15, cursor: canSend ? "pointer" : "default" }}>
                          🧾 Kirim Rincian Biaya ke Konsumen
                        </button>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ background: "#f0faf7", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#1a7a6a", fontWeight: 600, textAlign: "center" as const }}>
                            ✅ Rincian sudah dikirim — tunggu konsumen bayar
                          </div>
                          <button onClick={konfirmasiSelesai}
                            style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                            ✅ Konfirmasi Pembayaran Selesai
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })()}

        {/* Incoming Order card — inline, between toggle and stats */}
        {incoming && (
          <div style={{
            marginBottom: 16,
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 4px 20px rgba(26,122,106,0.18)",
            border: "2px solid #1a7a6a",
            overflow: "hidden",
            animation: "slideDown 0.3s ease",
          }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>🔔 Pesanan Masuk!</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>Konfirmasi dalam {incomingTimer}s</div>
              </div>
              {/* Countdown ring */}
              <div style={{ position: "relative", width: 38, height: 38 }}>
                <svg width="38" height="38" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                  <circle cx="19" cy="19" r="15" fill="none" stroke="#fff" strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 15}`}
                    strokeDashoffset={`${2 * Math.PI * 15 * (1 - incomingTimer / 30)}`}
                    strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>{incomingTimer}</div>
              </div>
            </div>

            {/* Order detail */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>{incoming.penggunaName}</div>
                  <div style={{ fontSize: 13, color: "#4a5568", marginTop: 2 }}>{incoming.vehicleModel} {incoming.vehicleYear}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>
                    {Array.isArray(incoming.damageCategories) ? incoming.damageCategories.join(", ") : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#ea580c" }}>{fmtRp(incoming.totalAmount ?? 0)}</div>
                  <div style={{ fontSize: 11, color: "#9aa5b4" }}>Fee: {fmtRp(incoming.platformFee ?? 0)}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "8px 12px", background: "#f0f8f6", borderRadius: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13 }}>📍</span>
                <span style={{ fontSize: 12, color: "#1a3a5c", lineHeight: 1.4 }}>{incoming.pickupAddress ?? "-"}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => rejectOrder(incoming.id)}
                  style={{ flex: 1, padding: "13px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  ✕ Tolak
                </button>
                <button
                  onClick={() => acceptOrder(incoming.id)}
                  style={{ flex: 2, padding: "13px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  ✓ Terima Pesanan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { icon: "💰", label: "Pendapatan Hari Ini", value: fmtRp(data?.todayIncome ?? 0), color: "#1a7a6a" },
            { icon: "📋", label: "Order Hari Ini", value: `${data?.todayOrders ?? 0} Order`, color: "#1a7a6a" },
            { icon: "⭐", label: "Rating Saya", value: data?.rating != null ? `${data.rating} / 5.0` : "Belum ada", color: "#f5a623" },
            {
              icon: "🏷️", label: "Platform Fee",
              value: data?.platformFeeStatus === "lunas"
                ? "Lunas ✓"
                : `Tagihan ${fmtRp(data?.platformFeePending ?? 0)}`,
              color: data?.platformFeeStatus === "lunas" ? "#1a7a6a" : "#ea580c",
            },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 18, padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Grafik Pendapatan */}
        <div style={{ background: "#fff", borderRadius: 18, padding: "18px 16px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>📊 Grafik Pendapatan</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["minggu", "bulan"] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)} style={{ padding: "5px 14px", borderRadius: 20, border: chartMode === m ? "none" : "1.5px solid #d0dce8", background: chartMode === m ? "rgba(26,122,106,0.12)" : "transparent", color: chartMode === m ? "#1a7a6a" : "#7a8a9a", fontWeight: chartMode === m ? 700 : 500, fontSize: 12, cursor: "pointer" }}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <BarChart data={chartData} activeIndex={todayIdx} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f4f8" }}>
            <div>
              <div style={{ fontSize: 11, color: "#9aa5b4" }}>{chartMode === "minggu" ? "Total Minggu Ini" : "Total 6 Bulan"}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#ea580c" }}>Rp {fmt(data?.weeklyTotal ?? 0)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#9aa5b4" }}>Terbaik</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a" }}>Rp {fmt(data?.weeklyBest ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* Riwayat Platform Fee */}
        {(data?.platformFeeHistory?.length ?? 0) > 0 && (
          <div style={{ background: "#fff", borderRadius: 18, padding: "18px 16px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>🏷️ Riwayat Platform Fee</div>
            {data!.platformFeeHistory.map((f, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "10px 0" }} />}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{f.weekStart} – {f.weekEnd}</div>
                    <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>Omset: {fmtRp(Number(f.omset))} · Fee: {fmtRp(Number(f.fee))}</div>
                  </div>
                  {f.isPaid ? (
                    <div style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(26,122,106,0.1)", border: "1px solid rgba(26,122,106,0.25)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1a7a6a" }}>✅ Lunas</span>
                    </div>
                  ) : (
                    <div style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.25)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c" }}>⏳ Proses</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Order Terbaru */}
        {(data?.recentOrders?.length ?? 0) > 0 && (
          <div style={{ background: "#fff", borderRadius: 18, padding: "18px 16px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 14 }}>📋 Order Terbaru</div>
            {data!.recentOrders.map((o, i) => (
              <div key={o.id}>
                {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "10px 0" }} />}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{getSvcCfg(data?.serviceType).emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{o.penggunaName}</div>
                    <div style={{ fontSize: 12, color: "#7a8a9a" }}>{o.vehicleModel} {o.vehicleYear} · {fmtDate(o.createdAt)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#ea580c" }}>{fmtRp(o.totalAmount)}</div>
                    <div style={{ fontSize: 11, color: "#9aa5b4" }}>Fee: {fmtRp(o.platformFee)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8f0f8", display: "flex", zIndex: 200, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[
          { icon: "🏠", label: "Beranda", active: true },
          { icon: "📋", label: "Pesanan", active: false },
          { icon: "💬", label: "Chat", active: false, badge: 0 },
          { icon: "👤", label: "Akun", active: false },
        ].map(item => (
          <button key={item.label} style={{ flex: 1, padding: "10px 0 6px", border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "relative" }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              {(item.badge ?? 0) > 0 && (
                <div style={{ position: "absolute", top: -4, right: -6, width: 16, height: 16, borderRadius: 8, background: "#ea580c", fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{item.badge}</div>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: item.active ? 700 : 500, color: item.active ? "#1a7a6a" : "#9aa5b4" }}>{item.label}</span>
            {item.active && <div style={{ position: "absolute", bottom: 0, width: 24, height: 3, borderRadius: "3px 3px 0 0", background: "#1a7a6a" }} />}
          </button>
        ))}
      </div>

    </div>
  );
}
