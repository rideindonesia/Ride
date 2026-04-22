import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";
import { BIAYA_LAYANAN, PLATFORM_FEE_PCT, calcBiayaPanggilan, calcEtaMinutes, calcEtaSecsLive, loadTarif } from "../utils/pricing";
import { usePushNotification } from "../hooks/usePushNotification";
import { useRideToast, RideToastContainer } from "../components/RideToast";

function haversineKmMitra(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  profilePhotoPath: string | null;
  serviceType: string;
  isOnline: boolean;
  todayIncome: number;
  todayOrders: number;
  rating: number;
  platformFeeStatus: string;
  platformFeePending: number;
  daysUntilSuspend: number | null;
  weeklyChart: ChartBar[];
  weeklyTotal: number;
  weeklyBest: number;
  monthlyChart: ChartBar[];
  recentOrders: {
    id: number; orderNo: string; serviceType: string; vehicleModel: string; vehicleYear: string;
    damageCategories: string[] | null; pickupAddress: string | null;
    totalAmount: number; platformFee: number; penggunaName: string; createdAt: string;
    paymentData: { biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string } | null;
  }[];
  platformFeeHistory: {
    weekStart: string; weekEnd: string; omset: number; fee: number; isPaid: boolean;
  }[];
}

interface IncomingOrder {
  id: number; orderNo: string; serviceType: string; vehicleType: string;
  vehicleModel: string; vehicleYear: string; damageCategories: string[];
  description: string | null;
  pickupAddress: string; pickupLat: number | null; pickupLng: number | null;
  totalAmount: number; platformFee: number;
  penggunaName: string; penggunaPhotoPath?: string | null; createdAt: string;
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

function playOrderBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const beep = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.4, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(880, 0, 0.15);
    beep(1100, 0.2, 0.15);
    beep(880, 0.4, 0.2);
  } catch { /* ignore — browser may block if no user interaction yet */ }
}

export default function DashboardMitra() {
  usePushNotification(true);
  const { toasts, showToast, removeToast } = useRideToast();
  const [, navigate] = useLocation();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"minggu" | "bulan">("minggu");
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [incoming, setIncoming] = useState<IncomingOrder | null>(null);
  const [incomingTimer, setIncomingTimer] = useState(30);
  const [incomingDistInfo, setIncomingDistInfo] = useState<{ km: number; eta: number; callFee: number } | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const seenOrderIds = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active order (after accepting) with chat
  const [activeOrder, setActiveOrder] = useState<IncomingOrder | null>(null);
  const [chatMsgs, setChatMsgs] = useState<{ id: number; senderRole: string; message: string; createdAt: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Cancel order modal
  const [mCancelModalOpen, setMCancelModalOpen] = useState(false);
  const [mCancelReason, setMCancelReason] = useState("");
  const [mCancelOther, setMCancelOther] = useState("");
  const [mCancelling, setMCancelling] = useState(false);

  // Laporan masalah modal (dari history mitra)
  const [mLaporModal, setMLaporModal] = useState<{ open: boolean; orderId: number | null; orderNo: string }>({ open: false, orderId: null, orderNo: "" });
  const [mLaporMessage, setMLaporMessage] = useState("");
  const [mLaporSubmitting, setMLaporSubmitting] = useState(false);
  const [platformFeePct, setPlatformFeePct] = useState(PLATFORM_FEE_PCT);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Mitra order phase: diterima → chat → menuju → tiba → pengerjaan → selesai
  type MitraPhase = "diterima" | "chat" | "menuju" | "tiba" | "pengerjaan" | "selesai";
  const [mitraPhase, setMitraPhase] = useState<MitraPhase>("diterima");
  const [penggunaConfirmed, setPenggunaConfirmed] = useState(false);
  const [paymentConfirmedByUser, setPaymentConfirmedByUser] = useState(false);
  const [paymentInfoFromUser, setPaymentInfoFromUser] = useState<{ method: string; finalTotal: number } | null>(null);
  const [etaSecs, setEtaSecs] = useState(0);
  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatchRef = useRef<number | null>(null); // watchPosition ID saat menuju
  const [biayaJasa, setBiayaJasa] = useState("");
  const [biayaSparepart, setBiayaSparepart] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash"|"transfer"|"qris">("cash");
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [rincianSent, setRincianSent] = useState(false);

  // Bottom nav tab
  type TabId = "beranda" | "pesanan" | "chat" | "akun";
  const [activeTab, setActiveTab] = useState<TabId>("beranda");

  // Pesanan sub-tab
  const [pesananSubTab, setPesananSubTab] = useState<"aktif" | "riwayat">("aktif");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Riwayat Order pagination
  const [riwayatPage, setRiwayatPage] = useState(1);
  const [riwayatRows, setRiwayatRows] = useState<any[]>([]);
  const [riwayatTotal, setRiwayatTotal] = useState(0);
  const [riwayatLoading, setRiwayatLoading] = useState(false);
  const RIWAYAT_LIMIT = 15;

  // Platform Fee Modal
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [feeDetail, setFeeDetail] = useState<{
    totalAllFees: number; totalVerified: number; totalPending: number;
    weeks: { weekStart: string; weekEnd: string; fee: number; omset: number; orderCount: number; deadline: string }[];
    payments: { id: number; amountClaimed: number; amountVerified: number | null; status: string; notes: string | null; proofPhotoPath: string; createdAt: string; verifiedAt: string | null }[];
    suspendDeadline: string | null; daysUntilSuspend: number | null;
  } | null>(null);
  const [feeDetailLoading, setFeeDetailLoading] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payProof, setPayProof] = useState<File | null>(null);
  const [payProofPreview, setPayProofPreview] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  // Reviews & Rating
  const [reviewsData, setReviewsData] = useState<{ rows: any[]; total: number; avgRating: number | null; totalReviews: number } | null>(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Chat sub-tab
  const [chatSubTab, setChatSubTab] = useState<"aktif" | "riwayat">("aktif");

  // Chat history (Riwayat Pesan per order selesai)
  type ChatMsg = { id: number; senderRole: string; message: string; createdAt: string };
  const [chatHistoryOrderId, setChatHistoryOrderId] = useState<number | null>(null);
  const [chatHistoryMsgs, setChatHistoryMsgs] = useState<ChatMsg[]>([]);
  const [loadingChatHistory, setLoadingChatHistory] = useState(false);

  // Akun tab states
  const [openAkunSection, setOpenAkunSection] = useState<string | null>(null);
  type MitraProfileDoc = { uploaded: boolean; status: string };
  type MitraProfileData = { id: number; name: string; email: string; phone: string | null; createdAt: string; documents: { ktp: MitraProfileDoc; selfieKtp: MitraProfileDoc; sim: MitraProfileDoc; sertifikat: MitraProfileDoc }; operatingCity: string | null; accountStatus: string; totalDoneOrders: number };
  const [mitraProfile, setMitraProfile] = useState<MitraProfileData | null>(null);
  const [mCpOld, setMCpOld] = useState(""); const [mCpNew, setMCpNew] = useState(""); const [mCpConfirm, setMCpConfirm] = useState("");
  const [mCpLoading, setMCpLoading] = useState(false);
  const [mCpMsg, setMCpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mNotifSettings, setMNotifSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ride-notif-m") ?? "null") ?? { pesanan: true, chat: true, promo: false, ringtone: true }; } catch { return { pesanan: true, chat: true, promo: false, ringtone: true }; }
  });

  // Photo upload mitra
  const [mPhotoFile, setMPhotoFile] = useState<File | null>(null);
  const [mPhotoPreview, setMPhotoPreview] = useState<string | null>(null);
  const [mPhotoUploading, setMPhotoUploading] = useState(false);
  const [mPhotoMsg, setMPhotoMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const mPhotoInputRef = useRef<HTMLInputElement>(null);

  // Keamanan mitra sub-section
  const [mKeamananSub, setMKeamananSub] = useState<string | null>(null);
  const [mEditPhone, setMEditPhone] = useState("");

  // Report mitra
  const [mReportInput, setMReportInput] = useState("");
  const [mReportType, setMReportType] = useState("teknis");
  const [mReportLoading, setMReportLoading] = useState(false);
  const [mReportMsg, setMReportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Login history mitra (simulated)
  const mLoginHistory = [
    { device: "Chrome · Android", time: "16 Apr 2026, 10:30 WIB", current: true },
    { device: "Chrome · Windows", time: "14 Apr 2026, 18:45 WIB", current: false },
  ];

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/mitra/dashboard`);
      if (res.status === 401) { navigate("/login/form?role=mitra"); return; }
      const d = await res.json();
      setData(d);
      setIsOnline(d.isOnline ?? false);
      // Connect socket and identify as mitra with service type
      try {
        const meRes = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
        const me = await meRes.json();
        if (me.id) identifySocket(me.id, "mitra", d.serviceType ?? "bengkel");
      } catch {}
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [navigate]);

  const openFeeModal = async () => {
    setFeeModalOpen(true);
    setPaySuccess(false);
    setPayAmount("");
    setPayProof(null);
    setPayProofPreview(null);
    setFeeDetailLoading(true);
    try {
      const res = await fetch(`${BASE}/api/mitra/platform-fee/detail`, { credentials: "include" });
      if (res.ok) setFeeDetail(await res.json());
    } catch {}
    finally { setFeeDetailLoading(false); }
  };

  const submitFeePayment = async () => {
    if (!payProof || !payAmount || parseInt(payAmount.replace(/\D/g, "")) <= 0) return;
    setPaySubmitting(true);
    try {
      const fd = new FormData();
      fd.append("foto", payProof);
      fd.append("amountClaimed", payAmount.replace(/\D/g, ""));
      const res = await fetch(`${BASE}/api/mitra/platform-fee/pay`, { method: "POST", credentials: "include", body: fd });
      if (res.ok) {
        setPaySuccess(true);
        setPayAmount("");
        setPayProof(null);
        setPayProofPreview(null);
        // Refresh detail
        const d2 = await fetch(`${BASE}/api/mitra/platform-fee/detail`, { credentials: "include" });
        if (d2.ok) setFeeDetail(await d2.json());
        fetchDashboard();
      }
    } catch {}
    finally { setPaySubmitting(false); }
  };

  // Restore active order dari DB (untuk kasus reload halaman)
  const fetchActiveOrder = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/mitra/active-order`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (!d.order) {
        // Tidak ada order aktif — bersihkan state agar tidak tersisa dari sesi sebelumnya
        setActiveOrder(prev => {
          if (prev) { setPenggunaConfirmed(false); setMitraPhase("diterima"); }
          return null;
        });
        return;
      }
      const o = d.order;
      // Update order data (totalAmount & paymentData dari server)
      setActiveOrder(prev => {
        if (prev && prev.id === o.id) {
          // Order sama — hanya update data yang bisa berubah dari server
          return { ...prev, totalAmount: o.totalAmount ?? prev.totalAmount, ...(o.paymentData && { paymentData: o.paymentData }) };
        }
        // Order berbeda atau pertama kali load — gunakan data server sepenuhnya
        return o;
      });
      // Restore penggunaConfirmed dari DB
      const confirmed = !!o.penggunaConfirmed;
      if (confirmed) setPenggunaConfirmed(true);
      // Restore paymentConfirmedByUser dari paymentConfirmedAt
      if (o.paymentConfirmedAt) {
        setPaymentConfirmedByUser(true);
        if (o.paymentData) {
          setPaymentInfoFromUser({ method: o.paymentData.paymentMethod ?? "cash", finalTotal: o.paymentData.finalTotal ?? o.paymentData.total ?? 0 });
        }
      }
      // Restore phase dari DB
      // PENTING: jangan restore fase "menuju" dst jika user belum konfirmasi
      // Ini mencegah mitra masuk fase menuju tanpa persetujuan pengguna
      const phaseMap: Record<string, string> = { menuju: "menuju", tiba: "tiba", pengerjaan: "pengerjaan", selesai: "selesai" };
      const rawDbPhase = phaseMap[o.trackingPhase ?? ""] ?? "diterima";
      const safeDbPhase = !confirmed && rawDbPhase === "menuju" ? "diterima" : rawDbPhase;
      setMitraPhase(prev => {
        // Kalau prev sudah di fase aktif (bukan diterima), pertahankan
        if (prev !== "diterima" && prev !== "chat") return prev;
        return safeDbPhase as any;
      });
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
      if (!d.incoming) return;
      if (!seenOrderIds.current.has(d.incoming.id)) {
        // Order baru — set sebagai incoming
        seenOrderIds.current.add(d.incoming.id);
        setIncoming(d.incoming);
        setIncomingTimer(30);
        playOrderBeep();
        pushNotif({
          type: "order",
          icon: getSvcCfg(d.incoming.serviceType).emoji,
          title: "Pesanan Masuk!",
          body: `${d.incoming.penggunaName} — ${d.incoming.vehicleModel} ${d.incoming.vehicleYear}`,
          orderId: d.incoming.id,
        });
      } else {
        // Order sudah ada — refresh koordinat dan deskripsi kalau sebelumnya kosong (dari socket)
        setIncoming(prev => {
          if (!prev || prev.id !== d.incoming.id) return prev;
          const needsRefresh = !prev.pickupLat || !prev.pickupLng || prev.description === undefined;
          if (!needsRefresh) return prev;
          return {
            ...prev,
            pickupLat: d.incoming.pickupLat,
            pickupLng: d.incoming.pickupLng,
            description: d.incoming.description ?? prev.description,
          };
        });
      }
    } catch { /* ignore */ }
  }, [pushNotif]);

  useEffect(() => {
    fetchDashboard();
    fetchIncoming();
    fetchActiveOrder();
    // Backup polling — refresh incoming koordinat, dashboard, dan active order
    pollRef.current = setInterval(() => {
      fetchDashboard();
      fetchIncoming();
      fetchActiveOrder();
    }, 10000);

    // Socket: real-time incoming order notification for mitra
    const onNewOrder = (data: any) => {
      if (seenOrderIds.current.has(data.id)) return;
      seenOrderIds.current.add(data.id);
      setIncoming(data);
      setIncomingTimer(30);
      playOrderBeep();
      pushNotif({
        type: "order",
        icon: getSvcCfg(data.serviceType).emoji,
        title: "Pesanan Masuk!",
        body: `${data.penggunaName} — ${data.vehicleModel} ${data.vehicleYear}`,
        orderId: data.id,
      });
    };
    socket.on("order:new", onNewOrder);

    const onPenggunaConfirmed = () => {
      setPenggunaConfirmed(true);
      fetchActiveOrder();
    };
    socket.on("order:confirmed", onPenggunaConfirmed);

    // Konsumen konfirmasi pembayaran
    const onPaymentConfirmed = (data: { orderId: number; paymentMethod: string; finalTotal: number }) => {
      setPenggunaConfirmed(true);
      setPaymentConfirmedByUser(true);
      setPaymentInfoFromUser({ method: data.paymentMethod, finalTotal: data.finalTotal });
      fetchActiveOrder();
      const method = data.paymentMethod === "cash" ? "Tunai" : data.paymentMethod === "transfer" ? "Transfer" : data.paymentMethod === "qris" ? "QRIS" : data.paymentMethod;
      pushNotif({ type: "order", icon: "💰", title: "Konsumen Sudah Bayar!", body: `Konfirmasi penerimaan pembayaran via ${method}.` });
    };
    socket.on("order:payment_confirmed", onPaymentConfirmed);

    // When order is cancelled by pengguna — mitra's own cancellation is handled by doCancelOrderMitra directly
    const onOrderCancelled = (data: { orderId: number; canceledBy?: string; cancelReason?: string }) => {
      setActiveOrder(prev => (prev?.id === data.orderId ? null : prev));
      setMitraPhase("diterima");
      setChatMsgs([]);
      setPenggunaConfirmed(false);
      setPaymentConfirmedByUser(false);
      setPaymentInfoFromUser(null);
      if (locationWatchRef.current != null) {
        navigator.geolocation?.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      // Hanya tampil notifikasi jika konsumen yang batalkan (bukan mitra sendiri)
      if (data.canceledBy !== "mitra") {
        pushNotif({ type: "order", icon: "❌", title: "Pesanan Dibatalkan", body: "Konsumen membatalkan pesanan." });
      }
    };
    socket.on("order:cancelled", onOrderCancelled);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (locationWatchRef.current != null) navigator.geolocation?.clearWatch(locationWatchRef.current);
      socket.off("order:new", onNewOrder);
      socket.off("order:confirmed", onPenggunaConfirmed);
      socket.off("order:payment_confirmed", onPaymentConfirmed);
      socket.off("order:cancelled", onOrderCancelled);
      socket.disconnect();
    };
  }, [fetchDashboard, fetchIncoming, fetchActiveOrder, pushNotif]);

  // Load tarif dinamis dari DB
  useEffect(() => {
    loadTarif(BASE).then(() => setPlatformFeePct(PLATFORM_FEE_PCT));
  }, []);

  // Submit laporan masalah dari riwayat order (mitra)
  const submitMLaporan = async () => {
    if (!mLaporModal.orderId || !mLaporMessage.trim() || mLaporSubmitting) return;
    setMLaporSubmitting(true);
    try {
      const r = await fetch(`${BASE}/api/mitra/reports`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order",
          title: `Masalah Order #${mLaporModal.orderNo}`,
          message: mLaporMessage.trim(),
          orderId: mLaporModal.orderId,
          orderNo: mLaporModal.orderNo,
        }),
      });
      if (r.ok) {
        showToast({ type: "success", title: "Laporan terkirim!", message: "Tim RIDE akan memproses laporan Anda segera." });
        setMLaporModal({ open: false, orderId: null, orderNo: "" });
        setMLaporMessage("");
      } else {
        showToast({ type: "error", title: "Gagal", message: "Laporan gagal dikirim." });
      }
    } catch { showToast({ type: "error", title: "Gagal", message: "Terjadi kesalahan." }); }
    setMLaporSubmitting(false);
  };

  // Fetch riwayat order (paginated)
  useEffect(() => {
    if (activeTab !== "pesanan" || pesananSubTab !== "riwayat") return;
    setRiwayatLoading(true);
    fetch(`${BASE}/api/mitra/order-history?page=${riwayatPage}&limit=${RIWAYAT_LIMIT}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setRiwayatRows(d.rows ?? []); setRiwayatTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setRiwayatLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pesananSubTab, riwayatPage]);

  // Fetch reviews
  useEffect(() => {
    if (activeTab !== "akun") return;
    setReviewsLoading(true);
    fetch(`${BASE}/api/mitra/reviews?page=${reviewsPage}&limit=10`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setReviewsData(d))
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reviewsPage]);

  // Fetch mitra profile detail (dokumen, phone, dll)
  useEffect(() => {
    fetch(`${BASE}/api/mitra/profile-detail`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.id) setMitraProfile(d); })
      .catch(() => {});
  }, [BASE]);

  // Sync mitra notif settings to localStorage
  useEffect(() => {
    localStorage.setItem("ride-notif-m", JSON.stringify(mNotifSettings));
  }, [mNotifSettings]);

  // Countdown timer for incoming order
  useEffect(() => {
    if (!incoming) return;
    timerRef.current = setInterval(() => {
      setIncomingTimer(t => {
        if (t <= 1) { setIncoming(null); setConfirmReject(false); return 30; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [incoming?.id]);

  // Hitung jarak + ETA + biaya panggilan saat ada pesanan masuk
  // Dependency: id, pickupLat, pickupLng — agar recalculate saat koordinat direfresh dari polling
  useEffect(() => {
    if (!incoming) { setIncomingDistInfo(null); return; }
    const pLat = incoming.pickupLat;
    const pLng = incoming.pickupLng;
    if (pLat == null || pLng == null) {
      // Koordinat belum tersedia — tampilkan base fee sementara, polling akan refresh
      const callFee = calcBiayaPanggilan(incoming.serviceType, 0);
      setIncomingDistInfo({ km: 0, eta: calcEtaMinutes(0), callFee });
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const mLat = pos.coords.latitude;
        const mLng = pos.coords.longitude;
        const km = haversineKmMitra(mLat, mLng, pLat, pLng);
        const eta = calcEtaMinutes(km);
        const callFee = calcBiayaPanggilan(incoming.serviceType, km);
        setIncomingDistInfo({ km: Math.round(km * 10) / 10, eta, callFee });
      },
      () => {
        // GPS ditolak — hitung berdasarkan koordinat saja tanpa posisi mitra
        const callFee = calcBiayaPanggilan(incoming.serviceType, 0);
        setIncomingDistInfo({ km: 0, eta: calcEtaMinutes(0), callFee });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [incoming?.id, incoming?.pickupLat, incoming?.pickupLng]);

  const ACTIVE_PHASES = ["accepted", "menuju", "tiba", "pengerjaan"];
  const isBusyWithOrder = activeOrder !== null && ACTIVE_PHASES.includes(activeOrder.status ?? "");

  const toggleOnline = async () => {
    if (isBusyWithOrder) return;
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
      const res = await fetch(`${BASE}/api/mitra/toggle-online`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: next, lat, lng }),
      });
      if (!res.ok) setIsOnline(!next);
    } catch { setIsOnline(!next); }
    finally { setTogglingOnline(false); }
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, read: true })));

  // Real-time chat via socket (no more polling)
  useEffect(() => {
    if (!activeOrder) return;
    const orderId = activeOrder.id;

    // Fetch initial messages
    fetch(`${BASE}/api/chat/${orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setChatMsgs(d.messages ?? []);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }).catch(() => {});

    // Join socket room for real-time chat
    joinOrderRoom(orderId);

    const onChat = (data: any) => {
      if (data.orderId !== orderId) return;
      setChatMsgs(prev => {
        if (prev.some((m: any) => m.id === data.id)) return prev;
        const next = [...prev, data];
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        return next;
      });
    };
    socket.on("chat:message", onChat);

    return () => {
      leaveOrderRoom(orderId);
      socket.off("chat:message", onChat);
    };
  }, [activeOrder?.id]);

  const sendChat = async () => {
    if (!chatInput.trim() || !activeOrder || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const r = await fetch(`${BASE}/api/chat/${activeOrder.id}`, {
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

  const doCancelOrderMitra = async () => {
    if (!activeOrder || mCancelling) return;
    const reason = mCancelReason === "Lainnya" ? mCancelOther.trim() : mCancelReason;
    if (!reason) return;
    setMCancelling(true);
    await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/cancel`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelReason: reason }),
    }).catch(() => null);
    setMCancelling(false);
    setMCancelModalOpen(false);
    setMCancelReason("");
    setMCancelOther("");
    setActiveOrder(null);
    setMitraPhase("diterima");
    // Notifikasi satu kali dari tombol — tidak dari socket agar tidak dobel
    showToast({ icon: "✅", title: "Order Dibatalkan", body: "Pesanan berhasil dibatalkan.", color: "red" });
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
      joinOrderRoom(orderId);
      // Re-fetch setelah server hitung callFee (totalAmount) berdasarkan jarak GPS
      setTimeout(() => { fetchActiveOrder(); }, 1500);
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
    stopLocationWatch();
    setActiveOrder(null);
    setChatMsgs([]);
    setMitraPhase("diterima");
    setEtaSecs(0);
    setBiayaJasa(""); setBiayaSparepart("0"); setPaymentMethod("cash");
    setProofPhoto(null); setProofPreview(null); setRincianSent(false);
    pushNotif({ type: "system", icon: "🎉", title: "Pekerjaan Selesai", body: "Pesanan telah diselesaikan." });
    fetchDashboard();
  };

  const fetchChatHistory = async (orderId: number) => {
    if (chatHistoryOrderId === orderId) { setChatHistoryOrderId(null); return; }
    setLoadingChatHistory(true);
    try {
      const res = await fetch(`${BASE}/api/chat/${orderId}`, { credentials: "include" });
      const d = await res.json();
      setChatHistoryMsgs(d.messages ?? []);
      setChatHistoryOrderId(orderId);
    } catch { /* ignore */ } finally { setLoadingChatHistory(false); }
  };

  // Hentikan live tracking lokasi mitra
  const stopLocationWatch = () => {
    if (locationWatchRef.current != null) {
      navigator.geolocation?.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  };

  // Mulai GPS tracking + countdown timer saat fase "menuju"
  // Dipanggil dari startJourney() dan juga auto-restart saat fase di-restore dari DB
  const beginTracking = useCallback((pLat: number | null, pLng: number | null) => {
    if (!pLat || !pLng) return;

    const startCountdown = (initialSecs: number) => {
      if (etaTimerRef.current) clearInterval(etaTimerRef.current);
      setEtaSecs(initialSecs);
      etaTimerRef.current = setInterval(() => {
        setEtaSecs(prev => Math.max(0, prev - 1));
      }, 1000);
    };

    // GPS tersedia — hitung ETA dari posisi nyata, lalu mulai timer
    stopLocationWatch();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng, speed } = pos.coords;
          const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
          const km = haversineKmMitra(lat, lng, pLat, pLng);
          startCountdown(calcEtaSecsLive(km, speedKmh));
          fetch(`${BASE}/api/mitra/location`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ lat, lng, ...(speedKmh != null ? { speedKmh } : {}) }),
          }).catch(() => {});
        },
        () => { startCountdown(600); }, // GPS ditolak — fallback 10 menit
        { enableHighAccuracy: true, timeout: 8000 }
      );

      locationWatchRef.current = navigator.geolocation.watchPosition(
        pos => {
          const { latitude: lat, longitude: lng, speed } = pos.coords;
          const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
          const km = haversineKmMitra(lat, lng, pLat, pLng);
          // Setiap update GPS → restart countdown dari ETA baru (seperti Google Maps)
          startCountdown(calcEtaSecsLive(km, speedKmh));
          fetch(`${BASE}/api/mitra/location`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ lat, lng, ...(speedKmh != null ? { speedKmh } : {}) }),
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      startCountdown(600);
    }
  }, [stopLocationWatch]);

  // Auto-restart GPS tracking ketika fase "menuju" di-restore dari DB saat halaman di-refresh
  useEffect(() => {
    if (mitraPhase !== "menuju" || !activeOrder?.pickupLat || !activeOrder?.pickupLng) return;
    if (locationWatchRef.current != null) return; // Sudah berjalan
    beginTracking(activeOrder.pickupLat, activeOrder.pickupLng);
  }, [mitraPhase, activeOrder?.id]);

  const startJourney = async () => {
    if (!activeOrder) return;
    await updatePhase("menuju");
    setMitraPhase("menuju");
    beginTracking(activeOrder.pickupLat ?? null, activeOrder.pickupLng ?? null);
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
      <RideToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ── Cancel Order Modal (Mitra) ── */}
      {mCancelModalOpen && activeOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => !mCancelling && setMCancelModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "24px 20px 20px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", textAlign: "center", marginBottom: 4 }}>Batalkan Order?</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", textAlign: "center", marginBottom: 18, lineHeight: 1.5 }}>
              Membatalkan order akan memberitahu konsumen dan memengaruhi reputasi Anda.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4a5a6a", marginBottom: 8 }}>Alasan pembatalan:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {["Kendaraan mitra bermasalah", "Lokasi terlalu jauh", "Order tidak sesuai kemampuan", "Situasi darurat mendesak", "Lainnya"].map(opt => (
                <button key={opt} onClick={() => { setMCancelReason(opt); if (opt !== "Lainnya") setMCancelOther(""); }}
                  style={{ textAlign: "left", padding: "10px 14px", borderRadius: 12, border: mCancelReason === opt ? "2px solid #dc2626" : "1.5px solid #e0e8f0", background: mCancelReason === opt ? "#fef2f2" : "#fff", fontSize: 13, color: mCancelReason === opt ? "#dc2626" : "#4a5a6a", fontWeight: mCancelReason === opt ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 8, border: mCancelReason === opt ? "5px solid #dc2626" : "2px solid #d0dce8", flexShrink: 0 }} />
                  {opt}
                </button>
              ))}
              {mCancelReason === "Lainnya" && (
                <textarea value={mCancelOther} onChange={e => setMCancelOther(e.target.value)}
                  placeholder="Tuliskan alasan pembatalan..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, color: "#1a2a3a", resize: "none", outline: "none", minHeight: 72, fontFamily: "inherit", boxSizing: "border-box" }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setMCancelModalOpen(false)} disabled={mCancelling}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 14, fontWeight: 700, color: "#4a5a6a", cursor: "pointer" }}>
                Kembali
              </button>
              <button onClick={doCancelOrderMitra}
                disabled={mCancelling || !mCancelReason || (mCancelReason === "Lainnya" && !mCancelOther.trim())}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: mCancelling || !mCancelReason ? "#fca5a5" : "#dc2626", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: !mCancelReason || (mCancelReason === "Lainnya" && !mCancelOther.trim()) ? 0.6 : 1 }}>
                {mCancelling ? "Membatalkan..." : "Ya, Batalkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Laporan Masalah Modal (Mitra) ── */}
      {mLaporModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => !mLaporSubmitting && setMLaporModal({ open: false, orderId: null, orderNo: "" })}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "24px 20px 20px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", textAlign: "center", marginBottom: 4 }}>Laporkan Masalah</div>
            <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center", marginBottom: 18 }}>Order #{mLaporModal.orderNo}</div>
            <textarea value={mLaporMessage} onChange={e => setMLaporMessage(e.target.value)}
              placeholder="Ceritakan masalah Anda secara detail..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, color: "#1a2a3a", resize: "none", outline: "none", minHeight: 100, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setMLaporModal({ open: false, orderId: null, orderNo: "" })} disabled={mLaporSubmitting}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 14, fontWeight: 700, color: "#4a5a6a", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={submitMLaporan} disabled={mLaporSubmitting || !mLaporMessage.trim()}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: mLaporMessage.trim() ? "#1a3a5c" : "#e0e8f0", fontSize: 14, fontWeight: 700, color: "#fff", cursor: mLaporMessage.trim() ? "pointer" : "default" }}>
                {mLaporSubmitting ? "Mengirim..." : "Kirim Laporan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "52px 14px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Back button (non-beranda tabs) */}
          {activeTab !== "beranda" && (
            <button onClick={() => setActiveTab("beranda")} style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0, letterSpacing: "-1px" }}>
              &lt;-
            </button>
          )}
          {/* Avatar */}
          <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
            {data?.profilePhotoPath
              ? <img src={data.profilePhotoPath} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (data?.name ?? "M").charAt(0).toUpperCase()}
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
                {isBusyWithOrder ? (
                  <>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: "#f59e0b" }} />
                    <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>Sedang dalam order — tidak bisa terima order baru</span>
                  </>
                ) : (
                  <>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: isOnline ? "#22c55e" : "#ef4444" }} />
                    <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{isOnline ? "Online — Menerima pesanan" : "Offline"}</span>
                  </>
                )}
              </div>
            </div>
            {/* Toggle switch — disabled saat busy */}
            <button
              onClick={toggleOnline}
              disabled={togglingOnline || isBusyWithOrder}
              title={isBusyWithOrder ? "Selesaikan order aktif terlebih dahulu" : undefined}
              style={{
                width: 52, height: 28, borderRadius: 14, border: "none",
                cursor: isBusyWithOrder ? "not-allowed" : "pointer",
                background: isBusyWithOrder ? "#f59e0b" : isOnline ? "#22c55e" : "rgba(255,255,255,0.2)",
                position: "relative", transition: "background 0.2s",
                opacity: isBusyWithOrder ? 0.85 : 1,
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: isBusyWithOrder ? 26 : isOnline ? 26 : 3,
                width: 22, height: 22, borderRadius: 11, background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
          {isBusyWithOrder && (
            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
              Toggle aktif kembali setelah order selesai
            </div>
          )}
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

        {/* ══ BERANDA: mini banners ══ */}
        {activeTab === "beranda" && <>
          {incoming && (
            <button onClick={() => setActiveTab("pesanan")} style={{ width: "100%", marginBottom: 12, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", borderRadius: 16, padding: "12px 16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" as const }}>
              <span style={{ fontSize: 22 }}>🔔</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>Pesanan Masuk!</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 }}>{incoming.penggunaName} — {incoming.vehicleModel} · Konfirmasi {incomingTimer}s</div>
              </div>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 18 }}>›</span>
            </button>
          )}
          {activeOrder && (
            <button onClick={() => setActiveTab("pesanan")} style={{ width: "100%", marginBottom: 12, background: "#f0faf7", borderRadius: 16, padding: "12px 16px", border: "2px solid #1a7a6a", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" as const }}>
              <span style={{ fontSize: 22 }}>{getSvcCfg(activeOrder.serviceType).emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#1a2a3a", fontSize: 13, fontWeight: 800 }}>Order Aktif — {getSvcCfg(activeOrder.serviceType).header}</div>
                <div style={{ color: "#4a5a6a", fontSize: 11, marginTop: 1 }}>
                  {activeOrder.penggunaName} · {mitraPhase === "diterima" || mitraPhase === "chat" ? "Negosiasi" : mitraPhase === "menuju" ? "Menuju Lokasi" : mitraPhase === "tiba" ? "Sudah Tiba" : mitraPhase === "pengerjaan" ? "Sedang Dikerjakan" : "Pembayaran Final"}
                </div>
              </div>
              <span style={{ color: "#1a7a6a", fontSize: 18 }}>›</span>
            </button>
          )}
        </>}

        {/* ══ PESANAN TAB: sub-tab header ══ */}
        {activeTab === "pesanan" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {([
              { id: "aktif" as const, label: "Order Aktif", count: (activeOrder ? 1 : 0) + (incoming ? 1 : 0) },
              { id: "riwayat" as const, label: "Riwayat Order", count: riwayatTotal > 0 ? riwayatTotal : (data?.recentOrders?.length ?? 0) },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setPesananSubTab(tab.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 24, border: pesananSubTab === tab.id ? "none" : "1.5px solid #d0dce8", background: pesananSubTab === tab.id ? "#1a3a5c" : "#fff", color: pesananSubTab === tab.id ? "#fff" : "#7a8a9a", fontWeight: pesananSubTab === tab.id ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                {tab.label}
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: pesananSubTab === tab.id ? "rgba(255,255,255,0.25)" : "#e8f0f8", color: pesananSubTab === tab.id ? "#fff" : "#4a5a6a", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ══ PESANAN TAB: active order card ══ */}
        {activeTab === "pesanan" && pesananSubTab === "aktif" && activeOrder && (() => {
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
              <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                  {(activeOrder as any).penggunaProfilePhoto
                    ? <img src={(activeOrder as any).penggunaProfilePhoto} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (activeOrder.penggunaName ?? "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{activeOrder.penggunaName}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a" }}>📍 {activeOrder.vehicleModel} {activeOrder.vehicleYear}</div>
                </div>
              </div>
              {/* Foto kendaraan dari pengguna */}
              {(activeOrder as any).penggunaPhotoPath && (
                <div style={{ padding: "0 10px 10px" }}>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 6, fontWeight: 600 }}>📸 Foto Kendaraan</div>
                  <img src={(activeOrder as any).penggunaPhotoPath} alt="foto kendaraan" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, border: "1px solid #e0e8f0" }} />
                </div>
              )}

              {/* Kategori & deskripsi kerusakan */}
              {(Array.isArray((activeOrder as any).damageCategories) || (activeOrder as any).description) && (
                <div style={{ padding: "0 10px 12px" }}>
                  {Array.isArray((activeOrder as any).damageCategories) && (activeOrder as any).damageCategories.length > 0 && (
                    <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 2 }}>
                      🔧 {(activeOrder as any).damageCategories.join(", ")}
                    </div>
                  )}
                  {(activeOrder as any).description && (
                    <div style={{ fontSize: 12, color: "#4a5568", background: "#f0f4f8", borderRadius: 8, padding: "6px 10px", fontStyle: "italic", lineHeight: 1.5 }}>
                      "{(activeOrder as any).description}"
                    </div>
                  )}
                </div>
              )}

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
                    <button onClick={() => { setMCancelReason(""); setMCancelOther(""); setMCancelModalOpen(true); }}
                      style={{ marginTop: 8, width: "100%", padding: "11px", borderRadius: 14, border: "1.5px solid #fca5a5", background: "rgba(254,226,226,0.7)", color: "#dc2626", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      ✕ Batalkan & Tolak Order
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
                              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
                                <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMine ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMine ? "#1a7a6a" : "#eef1f5", color: isMine ? "#fff" : "#1a2a3a", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                                  {m.message}
                                </div>
                                <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
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
                    {/* Batalkan order di fase chat */}
                    <button onClick={() => { setMCancelReason(""); setMCancelOther(""); setMCancelModalOpen(true); }}
                      style={{ marginBottom: 8, width: "100%", padding: "10px", borderRadius: 14, border: "1.5px solid #fca5a5", background: "rgba(254,226,226,0.7)", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✕ Batalkan Order Ini
                    </button>
                    {/* Tunggu konfirmasi pengguna atau tampilkan aksi */}
                    {!penggunaConfirmed ? (
                      <div style={{ background: "#f0f4f8", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 15 }}>⏳</span>
                        <span style={{ fontSize: 12, color: "#4a5a6a", fontWeight: 600 }}>Menunggu konsumen menyetujui dan memanggil Anda...</span>
                      </div>
                    ) : (
                      <>
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
                        stopLocationWatch();
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
                  const biayaLayanan = BIAYA_LAYANAN;
                  const total = jasa + spare + biayaPanggilan + biayaLayanan;
                  const canSend = jasa > 0;
                  const fmtIdr = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

                  const kirimRincian = async () => {
                    if (!activeOrder || !canSend) return;
                    try {
                      // Upload foto bukti dulu jika ada (disimpan di DB untuk admin)
                      if (proofPhoto) {
                        const fd = new FormData(); fd.append("photo", proofPhoto);
                        await fetch(`${BASE}/api/mitra/orders/${activeOrder.id}/proof-photo`, {
                          method: "PATCH", credentials: "include", body: fd,
                        }).catch(() => null);
                      }
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
                    setPenggunaConfirmed(false);
                    setPaymentConfirmedByUser(false); setPaymentInfoFromUser(null);
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
                            <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e0e8f0", borderRadius: 10, overflow: "hidden", background: rincianSent ? "#f8fafc" : "#fff", opacity: rincianSent ? 0.7 : 1 }}>
                              <span style={{ padding: "0 8px", fontSize: 12, color: "#9aa5b4", background: "#f8fafc", borderRight: "1px solid #e0e8f0", alignSelf: "stretch", display: "flex", alignItems: "center" }}>Rp</span>
                              <input type="text" inputMode="numeric" value={val === "" ? "" : Number(val).toLocaleString("id-ID")} disabled={rincianSent} onChange={e => { if (rincianSent) return; const raw = e.target.value.replace(/\D/g, ""); set(raw); }}
                                style={{ flex: 1, padding: "10px 8px", border: "none", outline: "none", fontSize: 14, fontWeight: 700, color: "#1a2a3a", width: 0, cursor: rincianSent ? "not-allowed" : "text", background: "transparent" }} />
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
                            <button key={m} onClick={() => { if (!rincianSent) setPaymentMethod(m); }}
                              disabled={rincianSent}
                              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: paymentMethod === m ? "2px solid #ea580c" : "1.5px solid #e0e8f0", background: paymentMethod === m ? "#fff5f0" : "#fff", color: paymentMethod === m ? "#ea580c" : "#7a8a9a", fontWeight: 700, fontSize: 13, cursor: rincianSent ? "not-allowed" : "pointer", opacity: rincianSent ? 0.7 : 1 }}>
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
                      ) : !paymentConfirmedByUser ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ background: "#fef3c7", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#92400e", fontWeight: 600, textAlign: "center" as const }}>
                            ⏳ Rincian terkirim — menunggu konsumen konfirmasi pembayaran...
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ background: "#f0faf7", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#1a7a6a", fontWeight: 600, textAlign: "center" as const }}>
                            ✅ Konsumen sudah bayar via {paymentInfoFromUser?.method === "cash" ? "Tunai" : paymentInfoFromUser?.method === "transfer" ? "Transfer Bank" : paymentInfoFromUser?.method === "qris" ? "QRIS" : (paymentInfoFromUser?.method ?? "-")} — Klik konfirmasi untuk selesaikan order
                          </div>
                          <button onClick={konfirmasiSelesai}
                            style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                            ✅ Konfirmasi Terima Pembayaran
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

        {/* ══ PESANAN TAB: incoming order card ══ */}
        {activeTab === "pesanan" && pesananSubTab === "aktif" && incoming && (
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
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {/* Avatar pengguna */}
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                    {(incoming as any).penggunaPhotoPath
                      ? <img src={(incoming as any).penggunaPhotoPath} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (incoming.penggunaName ?? "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a3a" }}>{incoming.penggunaName}</div>
                  <div style={{ fontSize: 13, color: "#4a5568", marginTop: 2 }}>{incoming.vehicleModel} {incoming.vehicleYear}</div>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>
                    {Array.isArray(incoming.damageCategories) ? incoming.damageCategories.join(", ") : ""}
                  </div>
                  {incoming.description && (
                    <div style={{ fontSize: 12, color: "#4a5568", marginTop: 4, fontStyle: "italic", maxWidth: 200 }}>
                      "{incoming.description}"
                    </div>
                  )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#ea580c" }}>
                    {incomingDistInfo ? fmtRp(incomingDistInfo.callFee) : "Menghitung…"}
                  </div>
                  <div style={{ fontSize: 11, color: "#9aa5b4" }}>Biaya panggilan</div>
                  {incomingDistInfo && incomingDistInfo.km > 0 && (
                    <div style={{ fontSize: 11, color: "#1a7a6a", fontWeight: 600, marginTop: 2 }}>
                      {incomingDistInfo.km} km · Est. {incomingDistInfo.eta} mnt
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "8px 12px", background: "#f0f8f6", borderRadius: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>📍</span>
                <span style={{ fontSize: 12, color: "#1a3a5c", lineHeight: 1.4 }}>{incoming.pickupAddress ?? "-"}</span>
              </div>
              {/* Foto kendaraan dari pengguna */}
              {incoming.penggunaPhotoPath && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#7a8a9a", marginBottom: 4, fontWeight: 600 }}>📸 Foto Kendaraan</div>
                  <img src={incoming.penggunaPhotoPath} alt="foto kendaraan" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, border: "1px solid #e0e8f0" }} />
                </div>
              )}
              {incomingDistInfo && (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {incomingDistInfo.km > 0 && (
                    <div style={{ flex: 1, padding: "6px 10px", background: "#e6f4f1", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a7a6a" }}>{incomingDistInfo.km} km</div>
                      <div style={{ fontSize: 10, color: "#5a8a80" }}>Jarak</div>
                    </div>
                  )}
                  <div style={{ flex: 1, padding: "6px 10px", background: "#e6f4f1", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1a7a6a" }}>{incomingDistInfo.eta} mnt</div>
                    <div style={{ fontSize: 10, color: "#5a8a80" }}>Est. tiba</div>
                  </div>
                  <div style={{ flex: 1.5, padding: "6px 10px", background: "#fff3e0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c" }}>{fmtRp(incomingDistInfo.callFee)}</div>
                    <div style={{ fontSize: 10, color: "#a06030" }}>Biaya Panggilan</div>
                  </div>
                </div>
              )}

              {confirmReject ? (
                <div style={{ background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 10, textAlign: "center" }}>Yakin ingin menolak pesanan ini?</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setConfirmReject(false)}
                      style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#4a5568", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >← Kembali</button>
                    <button
                      onClick={() => { setConfirmReject(false); rejectOrder(incoming.id); }}
                      style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >Ya, Tolak</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setConfirmReject(true)}
                    style={{ flex: 1, padding: "13px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#ea580c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                  >
                    ✕ Tolak
                  </button>
                  <button
                    onClick={() => { setConfirmReject(false); acceptOrder(incoming.id); }}
                    style={{ flex: 2, padding: "13px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                  >
                    ✓ Terima Pesanan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ BERANDA: stats / grafik / platform fee ══ */}
        {activeTab === "beranda" && <>

        {/* Suspension warning */}
        {data?.platformFeeStatus === "belum_lunas" && data?.daysUntilSuspend !== null && data.daysUntilSuspend <= 3 && (
          <div onClick={openFeeModal} style={{ background: data.daysUntilSuspend < 0 ? "#fef2f2" : "#fff7ed", border: `1px solid ${data.daysUntilSuspend < 0 ? "#fca5a5" : "#fdba74"}`, borderRadius: 16, padding: "14px 16px", marginBottom: 14, cursor: "pointer" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: data.daysUntilSuspend < 0 ? "#dc2626" : "#ea580c", marginBottom: 4 }}>
              {data.daysUntilSuspend < 0 ? "⛔ Akun Terancam Suspended" : `⚠️ Batas Waktu ${data.daysUntilSuspend} Hari Lagi`}
            </div>
            <div style={{ fontSize: 12, color: data.daysUntilSuspend < 0 ? "#b91c1c" : "#c2410c" }}>
              {data.daysUntilSuspend < 0
                ? "Platform fee belum dibayar melewati batas 7 hari. Segera bayar untuk menghindari suspend."
                : "Segera lunasi platform fee sebelum batas waktu. Tap untuk bayar sekarang."}
            </div>
          </div>
        )}

        {/* Stats 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { icon: "💰", label: "Pendapatan Hari Ini", value: fmtRp(data?.todayIncome ?? 0), color: "#1a7a6a", onClick: undefined as (() => void) | undefined },
            { icon: "📋", label: "Order Hari Ini", value: `${data?.todayOrders ?? 0} Order`, color: "#1a7a6a", onClick: undefined },
            { icon: "⭐", label: "Rating Saya", value: data?.rating != null ? `${data.rating} / 5.0` : "Belum ada", color: "#f5a623", onClick: undefined },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 18, padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
          {/* Platform Fee Card — clickable */}
          <div
            onClick={openFeeModal}
            style={{ background: data?.platformFeeStatus === "lunas" ? "#fff" : "linear-gradient(135deg, #fff7ed, #fff)", borderRadius: 18, padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer", border: data?.platformFeeStatus === "lunas" ? "none" : "1.5px solid rgba(234,88,12,0.2)", position: "relative", overflow: "hidden" }}
          >
            {data?.platformFeeStatus !== "lunas" && (
              <div style={{ position: "absolute", top: 8, right: 10, fontSize: 9, color: "#ea580c", fontWeight: 600, opacity: 0.7 }}>Tap ›</div>
            )}
            <div style={{ fontSize: 26, marginBottom: 8 }}>🏷️</div>
            <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>Platform Fee</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: data?.platformFeeStatus === "lunas" ? "#1a7a6a" : "#ea580c" }}>
              {data?.platformFeeStatus === "lunas" ? "Lunas ✓" : fmtRp(data?.platformFeePending ?? 0)}
            </div>
            {data?.platformFeeStatus !== "lunas" && (
              <div style={{ fontSize: 10, color: "#ea580c", marginTop: 2, opacity: 0.8 }}>Tap untuk bayar</div>
            )}
          </div>
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
                    <div style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>📅 Selesai</span>
                    </div>
                  ) : (
                    <div style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6" }}>🗓 Minggu Ini</span>
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
            {data!.recentOrders.slice(0, 5).map((o, i) => {
              const dt = new Date(o.createdAt);
              const dtStr = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={o.id}>
                  {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "10px 0" }} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 20 }}>🔧</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{o.penggunaName}</div>
                      <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.vehicleModel} {o.vehicleYear} · {dtStr}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ea580c" }}>{fmtRp(o.totalAmount ?? 0)}</div>
                      <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>Fee: {fmtRp(o.platformFee ?? 0)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </>}

        {/* ══ PESANAN TAB: Order Aktif — empty state ══ */}
        {activeTab === "pesanan" && pesananSubTab === "aktif" && !activeOrder && !incoming && (
          <div style={{ textAlign: "center", padding: "56px 24px" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada order aktif</div>
            <div style={{ fontSize: 13, color: "#9aa5b4" }}>Aktifkan status Online untuk mulai menerima pesanan</div>
          </div>
        )}

        {/* ══ PESANAN TAB: Riwayat Order (accordion) ══ */}
        {activeTab === "pesanan" && pesananSubTab === "riwayat" && (
          riwayatLoading && riwayatRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 24px", color: "#9aa5b4", fontSize: 14 }}>Memuat riwayat...</div>
          ) : riwayatRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 24px" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🗓️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada riwayat</div>
              <div style={{ fontSize: 13, color: "#9aa5b4" }}>Order yang sudah selesai akan tampil di sini</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {riwayatRows.map(o => {
                const cfg = getSvcCfg(o.serviceType);
                const isOpen = expandedOrderId === o.id;
                const pd = o.paymentData;
                const dt = new Date(o.createdAt);
                const dtStr = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) + " · " + dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
                const keluhan = Array.isArray(o.damageCategories) ? o.damageCategories.join(", ") : "-";
                return (
                  <div key={o.id} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
                    {/* Card header */}
                    <button onClick={() => setExpandedOrderId(isOpen ? null : o.id)} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 46, height: 46, borderRadius: 16, background: o.status === "cancelled" ? "rgba(220,38,38,0.1)" : "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                          {o.status === "cancelled" ? "✕" : cfg.emoji}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>{o.penggunaName}</span>
                            {o.status === "cancelled"
                              ? <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", borderRadius: 20, padding: "2px 8px" }}>✕ Dibatalkan</span>
                              : <span style={{ fontSize: 10, fontWeight: 700, color: "#1a7a6a", background: "rgba(26,122,106,0.1)", borderRadius: 20, padding: "2px 8px" }}>✓ Selesai</span>
                            }
                          </div>
                          <div style={{ fontSize: 12, color: "#7a8a9a" }}>{o.vehicleModel} {o.vehicleYear}</div>
                          <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>🕐 {dtStr}</div>
                          {o.status === "cancelled" && (o as any).canceledBy && (
                            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>Dibatalkan oleh {(o as any).canceledBy === "mitra" ? "Anda" : "konsumen"}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                          {o.totalAmount ? <div style={{ fontSize: 15, fontWeight: 800, color: o.status === "cancelled" ? "#dc2626" : "#1a7a6a" }}>{o.status !== "cancelled" ? "+" : ""}{fmtRp(o.totalAmount)}</div> : null}
                          <div style={{ fontSize: 18, color: "#b0bec5", marginTop: 4 }}>{isOpen ? "▲" : "▼"}</div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div style={{ borderTop: "1px solid #f0f4f8" }}>
                        {/* DETAIL ORDER */}
                        <div style={{ padding: "14px 16px" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 10 }}>DETAIL ORDER</div>
                          {[
                            { label: "No. Order", val: o.orderNo },
                            { label: "Layanan", val: cfg.header },
                            { label: "Pelanggan", val: o.penggunaName },
                          ].map(row => (
                            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, color: "#7a8a9a" }}>{row.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a", textAlign: "right" as const, maxWidth: "60%" }}>{row.val}</span>
                            </div>
                          ))}
                          {keluhan !== "-" && (
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ fontSize: 13, color: "#7a8a9a" }}>Keluhan: </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{keluhan}</span>
                            </div>
                          )}
                          {o.pickupAddress && (
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8 }}>
                              <span style={{ fontSize: 13 }}>📍</span>
                              <span style={{ fontSize: 13, color: "#1a3a5c" }}>{o.pickupAddress}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 0 }}>
                            <span style={{ fontSize: 13, color: "#7a8a9a" }}>Metode Bayar</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{pd?.paymentMethod ? pd.paymentMethod.toUpperCase() : "-"}</span>
                          </div>
                        </div>

                        {/* RINCIAN PENDAPATAN */}
                        {pd && (() => {
                          const feePanggilan = Math.round(pd.biayaPanggilan * 0.15);
                          const feeLayanan = pd.biayaLayanan;
                          const totalSetoran = feePanggilan + feeLayanan;
                          return (
                            <>
                              <div style={{ background: "#f8fafc", borderTop: "1px solid #f0f4f8", padding: "14px 16px" }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 10 }}>RINCIAN PENDAPATAN</div>
                                {[
                                  { label: cfg.jasaLabel, val: pd.biayaJasa },
                                  ...(cfg.showSparepart && pd.biayaSparepart > 0 ? [{ label: cfg.sparepartLabel, val: pd.biayaSparepart }] : []),
                                  { label: "Biaya Panggilan", val: pd.biayaPanggilan },
                                  { label: "Biaya Layanan & Admin", val: pd.biayaLayanan },
                                ].map(row => (
                                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, color: "#4a5a6a" }}>{row.label}</span>
                                    <span style={{ fontSize: 13, color: "#4a5a6a" }}>{fmtRp(row.val)}</span>
                                  </div>
                                ))}
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid #e0e8f0", marginTop: 4 }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total Diterima</span>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: "#1a7a6a" }}>{fmtRp(pd.total)}</span>
                                </div>
                              </div>

                              {/* PLATFORM FEE */}
                              <div style={{ background: "#fff8f0", borderTop: "1px solid #fde8d0", padding: "14px 16px" }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 12 }}>PLATFORM FEE KE RIDE</div>

                                {/* Row 1: Biaya Panggilan × 15% */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>Biaya Panggilan × {platformFeePct}%</div>
                                    <div style={{ fontSize: 11, color: "#ea580c", marginTop: 2 }}>Kontribusi ke platform RIDE</div>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "#ea580c" }}>{fmtRp(feePanggilan)}</span>
                                </div>

                                {/* Row 2: Biaya Layanan & Admin */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>Biaya Layanan & Admin</div>
                                    <div style={{ fontSize: 11, color: "#ea580c", marginTop: 2 }}>Per order selesai</div>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "#ea580c" }}>{fmtRp(feeLayanan)}</span>
                                </div>

                                {/* Total Setoran */}
                                <div style={{ borderTop: "1px dashed #fbbf78", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total Setoran</div>
                                    <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 3 }}>⏳ Belum Dibayar</div>
                                  </div>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: "#dc2626" }}>{fmtRp(totalSetoran)}</span>
                                </div>
                              </div>
                            </>
                          );
                        })()}

                        {/* RATING KONSUMEN */}
                        {o.status === "done" && (
                          <div style={{ padding: "14px 16px", borderTop: "1px solid #f0f4f8", background: o.rating != null ? "#fffdf5" : "#f8fafc" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 10 }}>RATING KONSUMEN</div>
                            {o.rating != null ? (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: o.reviewComment ? 10 : 0 }}>
                                  <div style={{ display: "flex", gap: 3 }}>
                                    {[1,2,3,4,5].map(s => (
                                      <span key={s} style={{ fontSize: 22, color: s <= o.rating ? "#f59e0b" : "#e0e8f0" }}>★</span>
                                    ))}
                                  </div>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: "#d97706" }}>{Number(o.rating).toFixed(1)}</span>
                                  <span style={{ fontSize: 12, color: "#9aa5b4" }}>/ 5.0</span>
                                </div>
                                {o.reviewComment && (
                                  <div style={{ background: "#fff", border: "1.5px solid #fde68a", borderRadius: 12, padding: "10px 13px", fontSize: 13, color: "#4a5a6a", fontStyle: "italic" as const }}>
                                    "{o.reviewComment}"
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: 13, color: "#9aa5b4", fontStyle: "italic" as const }}>Konsumen belum memberikan ulasan</div>
                            )}
                          </div>
                        )}

                        {/* ALASAN PEMBATALAN */}
                        {o.status === "cancelled" && (o as any).cancelReason && (
                          <div style={{ margin: "12px 16px 0", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "12px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", marginBottom: 4 }}>⚠️ Alasan Pembatalan</div>
                            <div style={{ fontSize: 13, color: "#7a2020" }}>{(o as any).cancelReason}</div>
                          </div>
                        )}

                        {/* TOMBOL LAPORAN */}
                        <div style={{ padding: "12px 16px 16px" }}>
                          <button onClick={() => { setMLaporModal({ open: true, orderId: o.id, orderNo: o.orderNo }); setMLaporMessage(""); }}
                            style={{ width: "100%", padding: "11px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#7a8a9a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            ⚠️ Laporkan Masalah
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination riwayat */}
              {riwayatTotal > RIWAYAT_LIMIT && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "8px 0 4px" }}>
                  <button disabled={riwayatPage === 1 || riwayatLoading}
                    onClick={() => setRiwayatPage(p => Math.max(1, p - 1))}
                    style={{ padding: "8px 18px", borderRadius: 20, border: "1.5px solid #d0dce8", background: "#fff", color: "#4a5a6a", fontSize: 13, fontWeight: 600, cursor: riwayatPage === 1 ? "not-allowed" : "pointer", opacity: riwayatPage === 1 ? 0.4 : 1 }}>
                    ← Sebelumnya
                  </button>
                  <span style={{ fontSize: 13, color: "#7a8a9a" }}>{riwayatPage} / {Math.ceil(riwayatTotal / RIWAYAT_LIMIT)}</span>
                  <button disabled={riwayatPage >= Math.ceil(riwayatTotal / RIWAYAT_LIMIT) || riwayatLoading}
                    onClick={() => setRiwayatPage(p => p + 1)}
                    style={{ padding: "8px 18px", borderRadius: 20, border: "1.5px solid #d0dce8", background: "#fff", color: "#4a5a6a", fontSize: 13, fontWeight: 600, cursor: riwayatPage >= Math.ceil(riwayatTotal / RIWAYAT_LIMIT) ? "not-allowed" : "pointer", opacity: riwayatPage >= Math.ceil(riwayatTotal / RIWAYAT_LIMIT) ? 0.4 : 1 }}>
                    Berikutnya →
                  </button>
                </div>
              )}
              <div style={{ textAlign: "center", fontSize: 12, color: "#b0bec5", paddingBottom: 4 }}>
                Menampilkan {Math.min(riwayatRows.length, RIWAYAT_LIMIT)} dari {riwayatTotal} order selesai
              </div>
            </div>
          )
        )}

        {/* ══ CHAT TAB ══ */}
        {activeTab === "chat" && <>
          {/* Chat sub-tab pills */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {([
              { id: "aktif" as const, label: "Chat Aktif", count: activeOrder ? 1 : 0 },
              { id: "riwayat" as const, label: "Riwayat Chat", count: data?.recentOrders?.length ?? 0 },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setChatSubTab(tab.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 24, border: chatSubTab === tab.id ? "none" : "1.5px solid #d0dce8", background: chatSubTab === tab.id ? "#1a3a5c" : "#fff", color: chatSubTab === tab.id ? "#fff" : "#7a8a9a", fontWeight: chatSubTab === tab.id ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                {tab.label}
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: chatSubTab === tab.id ? "rgba(255,255,255,0.25)" : "#e8f0f8", color: chatSubTab === tab.id ? "#fff" : "#4a5a6a", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Chat Aktif */}
          {chatSubTab === "aktif" && <div style={{ background: "#fff", borderRadius: 18, marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f4f8", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>💬</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Chat Aktif</span>
              {activeOrder && <span style={{ fontSize: 11, background: "#1a7a6a", color: "#fff", borderRadius: 10, padding: "2px 10px", fontWeight: 700 }}>Online</span>}
            </div>
            {activeOrder ? (
              <>
                <div style={{ height: 300, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, background: "#f8fafc" }}>
                  {chatMsgs.length === 0
                    ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#b0bec5", fontSize: 13 }}>Belum ada pesan</div>
                    : chatMsgs.map(m => {
                        const isMe = m.senderRole === "mitra";
                        return (
                          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", gap: 2 }}>
                            <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: isMe ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMe ? "#1a7a6a" : "#eef1f5", color: isMe ? "#fff" : "#1a2a3a", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                              {m.message}
                            </div>
                            <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
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
              </>
            ) : (
              <div style={{ padding: "36px 24px", textAlign: "center", color: "#9aa5b4" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 4 }}>Tidak ada chat aktif</div>
                <div style={{ fontSize: 12 }}>Chat akan aktif saat Anda menerima dan memproses pesanan</div>
              </div>
            )}
          </div>}

          {/* Riwayat Chat */}
          {chatSubTab === "riwayat" && <div style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            {(data?.recentOrders?.length ?? 0) === 0 ? (
              <div style={{ padding: "56px 24px", textAlign: "center", color: "#9aa5b4" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🗂️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", marginBottom: 6 }}>Belum ada riwayat chat</div>
                <div style={{ fontSize: 13 }}>Riwayat chat akan muncul di sini setelah order selesai</div>
              </div>
            ) : (
              data!.recentOrders.map((o, i) => (
                <div key={o.id}>
                  {i > 0 && <div style={{ height: 1, background: "#f0f4f8" }} />}
                  <div>
                    <button onClick={() => fetchChatHistory(o.id)} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", textAlign: "left" as const }}>
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{getSvcCfg(o.serviceType).emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{o.penggunaName}</div>
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
                                const isMe = m.senderRole === "mitra";
                                return (
                                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", gap: 2 }}>
                                    <div style={{ maxWidth: "78%", padding: "8px 12px", borderRadius: isMe ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: isMe ? "#1a7a6a" : "#eef1f5", color: isMe ? "#fff" : "#1a2a3a", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                                      {m.message}
                                    </div>
                                    <span style={{ fontSize: 10, color: "#b0bec5" }}>{new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                  </div>
                                );
                              })
                        }
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>}
        </>}

        {/* ══ AKUN TAB ══ */}
        {activeTab === "akun" && (() => {
          const statusMap: Record<string, { label: string; color: string; bg: string }> = {
            approved: { label: "Aktif ✓", color: "#1a7a6a", bg: "#e8f5f2" },
            pending: { label: "Pending Verifikasi ⏳", color: "#d97706", bg: "#fef3c7" },
            rejected: { label: "Dibekukan ✗", color: "#e74c3c", bg: "#fde8e8" },
          };
          const accStatus = mitraProfile?.accountStatus ?? "pending";
          const sMap = statusMap[accStatus] ?? statusMap["pending"];
          const totalOrders = mitraProfile?.totalDoneOrders ?? (data?.recentOrders?.length ?? 0);
          const monthlyRevenue = (data?.recentOrders ?? []).reduce((s: number, o: any) => s + (o.totalAmount ?? 0), 0);
          const monthlyFee = (data?.recentOrders ?? []).reduce((s: number, o: any) => s + (o.platformFee ?? 0), 0);
          const monthlyNet = monthlyRevenue - monthlyFee;
          const avgPerOrder = totalOrders > 0 ? Math.round(monthlyNet / totalOrders) : 0;
          const photoUrl = mPhotoPreview ?? data?.profilePhotoPath ?? null;
          const svcEmoji: Record<string,string> = { bengkel:"🔧", elektronik:"💡", cuci:"🚿", barber:"✂️", inspeksi:"🔍", towing:"🚛" };

          return (
          <div style={{ padding: "0 0 12px" }}>
            {/* ── Hero Profil Mitra ── */}
            <div style={{ background: "linear-gradient(135deg, #0d2137 0%, #1a7a6a 100%)", borderRadius: 22, padding: "24px 18px 20px", marginBottom: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.13)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div onClick={() => mPhotoInputRef.current?.click()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, cursor: "pointer" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(255,255,255,0.18)", border: "2.5px solid rgba(255,255,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#fff", overflow: "hidden", position: "relative" }}>
                    {photoUrl ? <img src={photoUrl} alt="foto" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (data?.name ?? "M").charAt(0).toUpperCase()}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.38)", fontSize: 8, color: "#fff", textAlign: "center", padding: "3px 0", fontWeight: 600, letterSpacing: 0 }}>📷</div>
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>Ganti<br/>foto</div>
                </div>
                <input ref={mPhotoInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
                  const f = e.target.files?.[0]; if (f) { setMPhotoFile(f); const rd = new FileReader(); rd.onload = ev => setMPhotoPreview(ev.target?.result as string); rd.readAsDataURL(f); }
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{data?.name ?? "Memuat..."}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                    {svcEmoji[data?.serviceType ?? ""] ?? "🔧"} {serviceLabel(data?.serviceType ?? "")} · {mitraProfile?.phone ?? mitraProfile?.operatingCity ?? "—"}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", marginTop: 6, background: sMap.bg, borderRadius: 8, padding: "3px 8px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sMap.color }}>{sMap.label}</span>
                  </div>
                </div>
              </div>
              {mPhotoFile && (
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button disabled={mPhotoUploading} onClick={async () => {
                    if (!mPhotoFile) return; setMPhotoUploading(true); setMPhotoMsg(null);
                    const fd = new FormData(); fd.append("photo", mPhotoFile);
                    const r = await fetch(`${BASE}/api/mitra/upload-photo`, { method:"POST", credentials:"include", body:fd }).catch(() => null);
                    setMPhotoUploading(false);
                    if (r?.ok) {
                      const d = await r.json().catch(() => null);
                      setMPhotoFile(null);
                      setMPhotoPreview(null);
                      if (d?.photoUrl) setData((prev: any) => prev ? { ...prev, profilePhotoPath: d.photoUrl } : prev);
                      setMPhotoMsg({ type:"ok", text:"Foto berhasil diperbarui!" });
                    } else setMPhotoMsg({ type:"err", text:"Gagal upload foto" });
                  }} style={{ flex:1, background:"#fff", border:"none", borderRadius:10, padding:"8px 0", fontSize:12, fontWeight:800, color:"#1a7a6a", cursor:"pointer" }}>
                    {mPhotoUploading ? "Mengupload..." : "Upload Foto"}
                  </button>
                  <button onClick={() => { setMPhotoFile(null); setMPhotoPreview(null); }} style={{ flex:1, background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:10, padding:"8px 0", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer" }}>Batal</button>
                </div>
              )}
              {mPhotoMsg && <div style={{ fontSize:11, color: mPhotoMsg.type==="ok"?"#a0f0d0":"#ffaaaa", marginTop:6 }}>{mPhotoMsg.text}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                {[
                  { val: data?.rating != null ? Number(data.rating).toFixed(1) : "—", label: "Rating" },
                  { val: totalOrders, label: "Total Order" },
                  { val: mitraProfile?.createdAt ? new Date(mitraProfile.createdAt).getFullYear() : "—", label: "Bergabung" },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "8px 0", textAlign: "center" as const }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Ulasan & Rating yang Diterima ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <button onClick={() => setOpenAkunSection(openAkunSection === "ulasan" ? null : "ulasan")}
                style={{ width: "100%", background: "none", border: "none", padding: "14px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const }}>
                <span style={{ fontSize: 20 }}>⭐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Ulasan & Rating</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>
                    {reviewsData ? `${reviewsData.totalReviews} ulasan · Rata-rata ${reviewsData.avgRating ?? "—"} ⭐` : "Memuat..."}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "ulasan" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "ulasan" && (
                <div style={{ borderTop: "1px solid #f0f4f8", padding: "14px" }}>
                  {reviewsLoading && !reviewsData ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#9aa5b4", fontSize: 13 }}>Memuat ulasan...</div>
                  ) : (reviewsData?.rows?.length ?? 0) === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 4 }}>Belum ada ulasan</div>
                      <div style={{ fontSize: 12, color: "#9aa5b4" }}>Ulasan dari konsumen akan muncul di sini setelah order selesai</div>
                    </div>
                  ) : (
                    <>
                      {/* Summary row */}
                      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: 1, background: "linear-gradient(135deg, #fffbeb, #fef3c7)", borderRadius: 14, padding: "12px", textAlign: "center" as const }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: "#d97706" }}>{reviewsData?.avgRating ?? "—"}</div>
                          <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>★ Rata-rata</div>
                        </div>
                        <div style={{ flex: 1, background: "#f0faf7", borderRadius: 14, padding: "12px", textAlign: "center" as const }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: "#1a7a6a" }}>{reviewsData?.totalReviews ?? 0}</div>
                          <div style={{ fontSize: 11, color: "#1a7a6a", marginTop: 2 }}>Total Ulasan</div>
                        </div>
                      </div>
                      {/* Review cards */}
                      {reviewsData!.rows.map((r: any) => {
                        const stars = Math.round(r.rating ?? 0);
                        const starStr = "★".repeat(stars) + "☆".repeat(5 - stars);
                        const svcEmoji2: Record<string,string> = { bengkel:"🔧", elektronik:"💡", cuci:"🚿", barber:"✂️", inspeksi:"🔍", towing:"🚛" };
                        return (
                          <div key={r.id} style={{ background: "#f8fafc", borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{r.penggunaName}</div>
                                <div style={{ fontSize: 11, color: "#9aa5b4" }}>{svcEmoji2[r.serviceType] ?? "🔧"} {serviceLabel(r.serviceType)} · {new Date(r.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</div>
                              </div>
                              <div style={{ fontSize: 15, color: "#f59e0b", fontWeight: 700, letterSpacing: 1 }}>{starStr}</div>
                            </div>
                            {r.reviewComment && (
                              <div style={{ fontSize: 13, color: "#4a5a6a", lineHeight: 1.5, background: "#fff", borderRadius: 10, padding: "8px 10px", marginTop: 4 }}>
                                "{r.reviewComment}"
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Reviews pagination */}
                      {(reviewsData?.total ?? 0) > 10 && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 10 }}>
                          <button disabled={reviewsPage === 1 || reviewsLoading}
                            onClick={() => setReviewsPage(p => Math.max(1, p - 1))}
                            style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 13, color: "#4a5a6a", cursor: "pointer", opacity: reviewsPage === 1 ? 0.4 : 1 }}>
                            ← Sebelumnya
                          </button>
                          <span style={{ fontSize: 12, color: "#9aa5b4", display: "flex", alignItems: "center" }}>{reviewsPage} / {Math.ceil((reviewsData?.total ?? 0) / 10)}</span>
                          <button disabled={reviewsPage >= Math.ceil((reviewsData?.total ?? 0) / 10) || reviewsLoading}
                            onClick={() => setReviewsPage(p => p + 1)}
                            style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 13, color: "#4a5a6a", cursor: "pointer", opacity: reviewsPage >= Math.ceil((reviewsData?.total ?? 0) / 10) ? 0.4 : 1 }}>
                            Berikutnya →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Ringkasan Penghasilan ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Ringkasan Penghasilan</div>
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection === "penghasilan" ? null : "penghasilan")}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>📊</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Ringkasan Penghasilan</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Omset, fee, dan bersih bulan ini</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "penghasilan" ? "∨" : "›"}</span>
                </button>
                {openAkunSection === "penghasilan" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      {[
                        { label: "Total Omset Bulan Ini", val: fmtRp(monthlyRevenue), color: "#d97706" },
                        { label: "Total Platform Fee", val: fmtRp(monthlyFee), color: "#e74c3c" },
                        { label: "Penghasilan Bersih", val: fmtRp(monthlyNet), color: "#1a7a6a" },
                        { label: "Rata-rata per Order", val: fmtRp(avgPerOrder), color: "#1a3a5c" },
                      ].map(item => (
                        <div key={item.label} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 12px" }}>
                          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: item.color }}>{item.val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: "#9aa5b4", textAlign: "center" as const }}>Platform fee {platformFeePct}% dari biaya panggilan per order</div>
                    <button onClick={() => setActiveTab("beranda")}
                      style={{ width:"100%", marginTop:10, background:"#f0f4f8", border:"none", borderRadius:10, padding:"9px 0", fontSize:13, fontWeight:700, color:"#1a3a5c", cursor:"pointer" }}>
                      📈 Lihat Grafik Detail di Beranda
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Dokumen & Verifikasi ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Dokumen & Verifikasi</div>
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection === "dokumen" ? null : "dokumen")}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>📂</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Dokumen & Verifikasi</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Status verifikasi semua dokumen</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "dokumen" ? "∨" : "›"}</span>
                </button>
                {openAkunSection === "dokumen" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                    {[
                      { key: "ktp", label: "KTP", icon: "🪪", optional: false },
                      { key: "sim", label: "SIM", icon: "🚗", optional: false },
                      { key: "stnk", label: "STNK Kendaraan", icon: "📋", optional: false },
                      { key: "fotoKendaraan", label: "Foto Kendaraan", icon: "🚙", optional: false },
                      { key: "sertifikat", label: "Sertifikat Keahlian", icon: "🏆", optional: true },
                    ].map((doc, i) => {
                      const docData = mitraProfile?.documents?.[doc.key as keyof typeof mitraProfile.documents];
                      const status = docData?.status ?? "pending";
                      const uploaded = docData?.uploaded ?? false;
                      const isRejected = status === "rejected";
                      return (
                        <div key={doc.key} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #f0f4f8" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{doc.icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{doc.label}</div>
                                {doc.optional && <span style={{ fontSize:9, color:"#9aa5b4", fontWeight:700 }}>(opsional)</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>{uploaded ? "Dokumen diunggah" : "Belum diunggah"}</div>
                            </div>
                            <div style={{ borderRadius: 8, padding: "3px 8px", background: status === "approved" ? "#e8f5f2" : isRejected ? "#fde8e8" : "#fef3c7", fontSize: 11, fontWeight: 700, color: status === "approved" ? "#1a7a6a" : isRejected ? "#e74c3c" : "#d97706", flexShrink:0 }}>
                              {status === "approved" ? "✅ Terverifikasi" : isRejected ? "❌ Ditolak" : "⏳ Menunggu"}
                            </div>
                          </div>
                          {isRejected && (
                            <div style={{ background:"#fff5f5", borderRadius:8, padding:"6px 10px", marginTop:6, fontSize:11, color:"#e74c3c" }}>
                              📝 Catatan: Dokumen tidak terbaca / tidak sesuai. Harap unggah ulang.
                            </div>
                          )}
                          {(isRejected || !uploaded) && (
                            <button style={{ marginTop:6, background:"none", border:"1px solid #1a3a5c", borderRadius:8, padding:"4px 12px", fontSize:11, fontWeight:700, color:"#1a3a5c", cursor:"pointer" }}>
                              📤 Unggah {isRejected ? "Ulang" : "Dokumen"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {!mitraProfile && <div style={{ fontSize:12, color:"#9aa5b4", padding:"8px 0" }}>Memuat data dokumen...</div>}
                  </div>
                )}
              </div>
            </div>

            {/* ── Notifikasi ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Notifikasi</div>
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection === "notif-m" ? null : "notif-m")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>🔔</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Pengaturan Notifikasi</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Kelola pemberitahuan masuk</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="notif-m"?"∨":"›"}</span>
                </button>
                {openAkunSection === "notif-m" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    {[
                      { key:"pesanan", label:"Notifikasi Order Masuk", desc:"Notifikasi saat ada order baru tersedia" },
                      { key:"chat", label:"Notifikasi Chat Pelanggan", desc:"Notifikasi saat pelanggan mengirim pesan" },
                      { key:"promo", label:"Pengumuman dari RIDE", desc:"Update kebijakan dan program insentif mitra" },
                      { key:"ringtone", label:"Nada Dering / Getaran", desc:"Suara & getar saat order baru masuk" },
                    ].map(n => (
                      <div key={n.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderTop:"1px solid #f0f4f8" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#1a2a3a" }}>{n.label}</div>
                          <div style={{ fontSize:11, color:"#9aa5b4", marginTop:2 }}>{n.desc}</div>
                        </div>
                        <div onClick={() => setMNotifSettings((s: any) => ({ ...s, [n.key]: !s[n.key] }))}
                          style={{ width:42, height:24, borderRadius:12, background: mNotifSettings[n.key]?"#1a7a6a":"#d0d9e2", cursor:"pointer", position:"relative" as const, transition:"background 0.2s", flexShrink:0 }}>
                          <div style={{ position:"absolute" as const, top:3, left: mNotifSettings[n.key]?20:3, width:18, height:18, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", transition:"left 0.2s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Keamanan Akun ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Keamanan Akun</div>
              {/* Ganti Password */}
              <div>
                <button onClick={() => setMKeamananSub(mKeamananSub==="password"?null:"password")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>🔑</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Ganti Password</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Ubah kata sandi akun mitra</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{mKeamananSub==="password"?"∨":"›"}</span>
                </button>
                {mKeamananSub === "password" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    {(["mCpOld","mCpNew","mCpConfirm"] as const).map((k,i) => (
                      <input key={k} type="password"
                        value={k==="mCpOld"?mCpOld:k==="mCpNew"?mCpNew:mCpConfirm}
                        onChange={e => { if(k==="mCpOld") setMCpOld(e.target.value); else if(k==="mCpNew") setMCpNew(e.target.value); else setMCpConfirm(e.target.value); }}
                        placeholder={["Password lama","Password baru (min. 8 karakter)","Konfirmasi password baru"][i]}
                        style={{ width:"100%", border:"1.5px solid #e0e8ef", borderRadius:10, padding:"9px 12px", fontSize:13, boxSizing:"border-box" as const, marginBottom:8, outline:"none" }} />
                    ))}
                    {mCpMsg && <div style={{ fontSize:12, color: mCpMsg.type==="ok"?"#1a7a6a":"#e74c3c", marginBottom:8 }}>{mCpMsg.text}</div>}
                    <button disabled={mCpLoading} onClick={async () => {
                      setMCpMsg(null);
                      if (!mCpOld||!mCpNew||!mCpConfirm) { setMCpMsg({ type:"err", text:"Semua field wajib diisi" }); return; }
                      if (mCpNew!==mCpConfirm) { setMCpMsg({ type:"err", text:"Konfirmasi password tidak cocok" }); return; }
                      if (mCpNew.length<8) { setMCpMsg({ type:"err", text:"Password baru minimal 8 karakter" }); return; }
                      setMCpLoading(true);
                      const r = await fetch(`${BASE}/api/mitra/change-password`, { method:"PUT", credentials:"include", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ currentPassword:mCpOld, newPassword:mCpNew }) });
                      const d = await r.json();
                      setMCpLoading(false);
                      if (d.ok) { setMCpMsg({ type:"ok", text:"Password berhasil diubah!" }); setMCpOld(""); setMCpNew(""); setMCpConfirm(""); }
                      else setMCpMsg({ type:"err", text: d.error??"Gagal mengubah password" });
                    }} style={{ width:"100%", background: mCpLoading?"#b2dfdb":"#1a3a5c", color:"#fff", border:"none", borderRadius:10, padding:"10px 0", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      {mCpLoading?"Menyimpan...":"Ubah Password"}
                    </button>
                  </div>
                )}
              </div>
              {/* Ubah Nomor HP */}
              <div>
                <button onClick={() => setMKeamananSub(mKeamananSub==="ubah-hp"?null:"ubah-hp")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>📱</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Ubah Nomor HP</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Saat ini: {mitraProfile?.phone ?? "—"}</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{mKeamananSub==="ubah-hp"?"∨":"›"}</span>
                </button>
                {mKeamananSub === "ubah-hp" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    <input value={mEditPhone} onChange={e => setMEditPhone(e.target.value.replace(/\D/g,""))} placeholder="Nomor HP baru (08xxxxxxxxxx)"
                      style={{ width:"100%", border:"1.5px solid #e0e8ef", borderRadius:10, padding:"9px 12px", fontSize:13, boxSizing:"border-box" as const, marginBottom:10, outline:"none" }} />
                    <button style={{ width:"100%", background:"#1a3a5c", color:"#fff", border:"none", borderRadius:10, padding:"10px 0", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      Kirim Kode OTP
                    </button>
                  </div>
                )}
              </div>
              {/* Riwayat Login */}
              <div>
                <button onClick={() => setMKeamananSub(mKeamananSub==="riwayat-login"?null:"riwayat-login")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>🖥️</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Riwayat Login</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Perangkat & waktu masuk terakhir</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{mKeamananSub==="riwayat-login"?"∨":"›"}</span>
                </button>
                {mKeamananSub === "riwayat-login" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    {mLoginHistory.map((item, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderTop: i>0?"1px solid #f0f4f8":"none" }}>
                        <div style={{ width:36, height:36, borderRadius:10, background: item.current?"#e8f5f2":"#f0f4f8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                          {item.device.includes("Android")||item.device.includes("iPhone")?"📱":"💻"}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:"#1a2a3a" }}>{item.device}</div>
                            {item.current && <span style={{ background:"#1a7a6a", color:"#fff", fontSize:9, fontWeight:800, borderRadius:5, padding:"1px 6px" }}>SAAT INI</span>}
                          </div>
                          <div style={{ fontSize:11, color:"#9aa5b4", marginTop:2 }}>{item.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Bantuan & Dukungan ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Bantuan & Dukungan</div>
              {/* FAQ Mitra */}
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection==="bantuan-m"?null:"bantuan-m")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>❓</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>FAQ Khusus Mitra</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Pertanyaan umum untuk mitra</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="bantuan-m"?"∨":"›"}</span>
                </button>
                {openAkunSection === "bantuan-m" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    {[
                      { q:"Bagaimana cara menerima order?", a:"Aktifkan status Online di halaman Beranda. Order masuk akan tampil sebagai notifikasi, Anda punya 30 detik untuk menerima atau menolak." },
                      { q:"Kapan pendapatan saya masuk?", a:`Pendapatan dihitung dari setiap order yang berhasil diselesaikan dikurangi platform fee ${platformFeePct}% dari biaya panggilan.` },
                      { q:"Apa yang harus dilakukan jika ada masalah dengan pengguna?", a:"Hubungi Tim Mitra RIDE atau laporkan melalui menu Laporkan Masalah Teknis." },
                      { q:"Bagaimana jika pengguna tidak bayar?", a:"Laporkan melalui fitur Bantuan. Tim kami akan meninjau dan menyelesaikan dalam 3 hari kerja." },
                    ].map((faq, i) => (
                      <div key={i} style={{ padding:"10px 0", borderTop: i===0?"none":"1px solid #f0f4f8" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#1a3a5c", marginBottom:4 }}>Q: {faq.q}</div>
                        <div style={{ fontSize:12, color:"#5a6a7a", lineHeight:1.5 }}>{faq.a}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Chat Tim Mitra */}
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection==="chat-tim"?null:"chat-tim")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>🎧</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Chat dengan Tim Mitra RIDE</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Hubungi tim dukungan mitra kami</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="chat-tim"?"∨":"›"}</span>
                </button>
                {openAkunSection === "chat-tim" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    <div style={{ background:"#f0faf8", borderRadius:12, padding:"12px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1a7a6a", marginBottom:4 }}>🟢 Tim Mitra Online · Respons ~10 menit</div>
                      <div style={{ fontSize:11, color:"#5a7a6a" }}>Tim Mitra RIDE siap membantu Anda Senin–Sabtu pukul 08.00–21.00 WIB.</div>
                    </div>
                    <a href="mailto:mitra@ride.app" style={{ display:"block", background:"#1a3a5c", color:"#fff", textDecoration:"none", borderRadius:10, padding:"10px 0", fontSize:13, fontWeight:700, textAlign:"center" as const }}>
                      ✉️ Email Tim Mitra
                    </a>
                  </div>
                )}
              </div>
              {/* WhatsApp */}
              <div>
                <a href="https://wa.me/6280081433277" target="_blank" rel="noreferrer" style={{ textDecoration:"none" }}>
                  <div style={{ width:"100%", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, borderTop:"1px solid #f0f4f8" }}>
                    <span style={{ fontSize:20 }}>📲</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Hubungi via WhatsApp</div>
                      <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Chat langsung di WhatsApp Mitra RIDE</div>
                    </div>
                    <span style={{ fontSize:16, color:"#25D366", fontWeight:800 }}>›</span>
                  </div>
                </a>
              </div>
              {/* Laporkan Masalah Teknis */}
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection==="laporan-m"?null:"laporan-m")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>🚨</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Laporkan Masalah Teknis</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Bug, error, atau masalah aplikasi</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="laporan-m"?"∨":"›"}</span>
                </button>
                {openAkunSection === "laporan-m" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    <select value={mReportType} onChange={e => setMReportType(e.target.value)}
                      style={{ width:"100%", border:"1.5px solid #e0e8ef", borderRadius:10, padding:"9px 10px", fontSize:13, marginBottom:8, outline:"none", background:"#fff" }}>
                      <option value="teknis">Bug / Error aplikasi</option>
                      <option value="order">Masalah pada order</option>
                      <option value="pembayaran">Masalah pembayaran mitra</option>
                      <option value="lainnya">Lainnya</option>
                    </select>
                    <textarea value={mReportInput} onChange={e => setMReportInput(e.target.value)} placeholder="Jelaskan masalah secara detail..."
                      style={{ width:"100%", border:"1.5px solid #e0e8ef", borderRadius:10, padding:"9px 12px", fontSize:13, boxSizing:"border-box" as const, resize:"none", height:80, marginBottom:10, outline:"none" }} />
                    {mReportMsg && <div style={{ fontSize:12, color: mReportMsg.type==="ok"?"#1a7a6a":"#e74c3c", marginBottom:8 }}>{mReportMsg.text}</div>}
                    <button disabled={mReportLoading||!mReportInput.trim()} onClick={async () => {
                      setMReportLoading(true); setMReportMsg(null);
                      try {
                        const r = await fetch(`${BASE}/api/mitra/reports`, {
                          method:"POST", credentials:"include",
                          headers:{"Content-Type":"application/json"},
                          body: JSON.stringify({ type:"general", title:"Laporan Teknis Mitra", message: mReportInput.trim() }),
                        });
                        if (r.ok) { setMReportMsg({ type:"ok", text:"Laporan berhasil dikirim! Tim teknis kami akan merespons dalam 1x24 jam." }); setMReportInput(""); }
                        else setMReportMsg({ type:"err", text:"Gagal mengirim laporan, coba lagi." });
                      } catch { setMReportMsg({ type:"err", text:"Terjadi kesalahan jaringan." }); }
                      setMReportLoading(false);
                    }} style={{ width:"100%", background: mReportLoading?"#b2dfdb":"#e74c3c", color:"#fff", border:"none", borderRadius:10, padding:"10px 0", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      {mReportLoading?"Mengirim...":"Kirim Laporan"}
                    </button>
                  </div>
                )}
              </div>
              {/* Panduan Mitra */}
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection==="panduan-m"?null:"panduan-m")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>📖</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Panduan Penggunaan Aplikasi</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Panduan lengkap untuk mitra RIDE</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="panduan-m"?"∨":"›"}</span>
                </button>
                {openAkunSection === "panduan-m" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    {[
                      { step:"1", title:"Aktifkan Status Online", desc:"Tap tombol 'Go Online' di Beranda untuk mulai menerima order." },
                      { step:"2", title:"Terima Order", desc:"Saat order masuk, Anda punya 30 detik untuk menerima. Tap 'Terima Order'." },
                      { step:"3", title:"Perjalanan & Pengerjaan", desc:"Update status perjalanan, tiba, dan mulai pengerjaan sesuai progres." },
                      { step:"4", title:"Selesaikan & Foto Bukti", desc:"Upload foto bukti pekerjaan selesai, lalu masukkan biaya jasa." },
                      { step:"5", title:"Terima Pembayaran", desc:"Konfirmasi pembayaran dari pelanggan (cash/transfer/QRIS)." },
                    ].map((s, i) => (
                      <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderTop: i>0?"1px solid #f0f4f8":"none" }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:"#1a7a6a", color:"#fff", fontSize:12, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{s.step}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#1a2a3a", marginBottom:2 }}>{s.title}</div>
                          <div style={{ fontSize:11, color:"#5a6a7a", lineHeight:1.5 }}>{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Legal & Kemitraan ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Legal & Kemitraan</div>
              {[
                { id:"perjanjian-m", icon:"📋", label:"Perjanjian Kemitraan RIDE", sub:"Syarat & ketentuan sebagai mitra", content:`Sebagai mitra RIDE, Anda terikat perjanjian kemitraan yang mengharuskan memberikan layanan profesional sesuai standar RIDE. Platform fee sebesar ${platformFeePct}% dari biaya panggilan berlaku untuk setiap transaksi. RIDE berhak menangguhkan akun mitra yang melanggar ketentuan layanan. Perjanjian ini berlaku selama akun mitra aktif.`, showTermsLink: true },
                { id:"kebijakan-m", icon:"💼", label:"Kebijakan Platform & Komisi", sub:"Sistem komisi dan kebijakan mitra", content:`Platform fee RIDE adalah ${platformFeePct}% dari biaya panggilan per order (tidak termasuk biaya sparepart dan biaya jasa). Fee dihitung otomatis saat order selesai dan disetujui pelanggan. RIDE berhak mengubah kebijakan komisi dengan pemberitahuan 14 hari sebelumnya. Mitra dengan performa tinggi (rating ≥4.8, order ≥50) dapat mengajukan program mitra unggulan dengan fee lebih rendah.`, showKomisiLink: true },
                { id:"privasi-m", icon:"🛡️", label:"Kebijakan Privasi", sub:"Data dan keamanan informasi mitra", content:"Data pribadi mitra disimpan dengan enkripsi dan tidak dibagikan kepada pihak ketiga tanpa izin. Lokasi Anda dipantau hanya selama sesi layanan aktif dan ditampilkan kepada pengguna untuk koordinasi. Dokumen verifikasi (KTP) dan rekening bank hanya digunakan untuk keperluan verifikasi dan pencairan saldo. Untuk penghapusan data, hubungi mitra@rideindonesia.com." },
              ].map(item => (
                <div key={item.id}>
                  <button onClick={() => setOpenAkunSection(openAkunSection===item.id?null:item.id)}
                    style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                    <span style={{ fontSize:20 }}>{item.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>{item.label}</div>
                      <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>{item.sub}</div>
                    </div>
                    <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection===item.id?"∨":"›"}</span>
                  </button>
                  {openAkunSection===item.id && (
                    <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8", fontSize:12, color:"#7a8a9a", lineHeight:1.7 }}>
                      {item.content}
                      {item.id === "privasi-m" && (
                        <button onClick={() => navigate("/kebijakan-privasi-mitra")} style={{ display:"block", marginTop:8, background:"none", border:"none", color:"#0ea56a", fontSize:12, fontWeight:700, cursor:"pointer", padding:0, textDecoration:"underline" }}>
                          Lihat kebijakan privasi lengkap →
                        </button>
                      )}
                      {"showTermsLink" in item && item.showTermsLink && (
                        <button onClick={() => navigate("/syarat-ketentuan-mitra")} style={{ display:"block", marginTop:8, background:"none", border:"none", color:"#0ea56a", fontSize:12, fontWeight:700, cursor:"pointer", padding:0, textDecoration:"underline" }}>
                          Lihat syarat & ketentuan lengkap →
                        </button>
                      )}
                      {"showKomisiLink" in item && item.showKomisiLink && (
                        <button onClick={() => navigate("/kebijakan-komisi")} style={{ display:"block", marginTop:8, background:"none", border:"none", color:"#0ea56a", fontSize:12, fontWeight:700, cursor:"pointer", padding:0, textDecoration:"underline" }}>
                          Lihat kebijakan komisi lengkap →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Tentang Aplikasi ── */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Tentang Aplikasi</div>
              <div>
                <button onClick={() => setOpenAkunSection(openAkunSection==="tentang-m"?null:"tentang-m")}
                  style={{ width:"100%", background:"none", border:"none", padding:"12px 14px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" as const, borderTop:"1px solid #f0f4f8" }}>
                  <span style={{ fontSize:20 }}>ℹ️</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a2a3a" }}>Tentang RIDE</div>
                    <div style={{ fontSize:12, color:"#9aa5b4", marginTop:1 }}>Versi 1.0.0 · Mitra App</div>
                  </div>
                  <span style={{ fontSize:16, color:"#b0bec5" }}>{openAkunSection==="tentang-m"?"∨":"›"}</span>
                </button>
                {openAkunSection === "tentang-m" && (
                  <div style={{ padding:"0 14px 14px", borderTop:"1px solid #f0f4f8" }}>
                    <div style={{ textAlign:"center" as const, padding:"12px 0 8px" }}>
                      <div style={{ fontSize:30, fontWeight:900, color:"#1a3a5c", letterSpacing:-1 }}>RIDE</div>
                      <div style={{ fontSize:12, color:"#9aa5b4", marginTop:4 }}>Super App Jasa Panggilan</div>
                      <div style={{ fontSize:11, color:"#b0bec5", marginTop:2 }}>Versi 1.0.0 · Mitra App · Build 2026</div>
                    </div>
                    <div style={{ background:"#f0faf8", borderRadius:12, padding:"12px", marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#1a7a6a", marginBottom:4 }}>No. Registrasi Mitra</div>
                      <div style={{ fontSize:16, fontWeight:900, color:"#1a3a5c", letterSpacing:2 }}>RIDE-M-{String(mitraProfile?.id ?? "0000").padStart(4,"0")}</div>
                      <div style={{ fontSize:10, color:"#7a8a9a", marginTop:4 }}>Gunakan nomor ini saat menghubungi tim RIDE</div>
                    </div>
                    <div style={{ fontSize:12, color:"#7a8a9a", lineHeight:1.7 }}>
                      RIDE menghubungkan pengguna dengan mitra jasa profesional di bidang bengkel, elektronik, cuci kendaraan, barber, inspeksi, dan towing. Terima kasih telah menjadi bagian dari ekosistem RIDE — bersama Anda, kami menghadirkan layanan jasa berkualitas ke seluruh penjuru kota.
                    </div>
                    <button onClick={() => navigate("/tentang-ride")} style={{ display:"block", marginTop:8, background:"none", border:"none", color:"#0ea56a", fontSize:12, fontWeight:700, cursor:"pointer", padding:0, textDecoration:"underline" }}>
                      Selengkapnya tentang RIDE →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tombol Keluar */}
            <button onClick={async () => { await fetch(`${BASE}/api/auth/logout`, { method:"POST", credentials:"include" }); navigate("/"); }}
              style={{ width:"100%", background:"#fff0f0", borderRadius:16, padding:"14px 16px", border:"1.5px solid #fde8e8", cursor:"pointer", display:"flex", alignItems:"center", gap:14, boxShadow:"0 2px 8px rgba(231,76,60,0.07)" }}>
              <span style={{ fontSize:22 }}>🚪</span>
              <span style={{ fontSize:14, fontWeight:700, color:"#e74c3c" }}>Keluar dari Akun</span>
            </button>
            <div style={{ height: 8 }} />
          </div>
          );
        })()}

      </div>

      {/* Bottom nav — functional */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8f0f8", display: "flex", zIndex: 200, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {([
          { id: "beranda" as const, icon: "🏠", label: "Beranda", badge: 0 },
          { id: "pesanan" as const, icon: "📋", label: "Pesanan", badge: (activeOrder ? 1 : 0) + (incoming ? 1 : 0) },
          { id: "chat" as const, icon: "💬", label: "Chat", badge: activeOrder && chatMsgs.some(m => m.senderRole === "pengguna") ? 1 : 0 },
          { id: "akun" as const, icon: "👤", label: "Akun", badge: 0 },
        ]).map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ flex: 1, padding: "10px 0 6px", border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
            <div style={{ position: "relative" }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              {item.badge > 0 && (
                <div style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, background: "#ea580c", fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{item.badge}</div>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: activeTab === item.id ? 700 : 500, color: activeTab === item.id ? "#1a7a6a" : "#9aa5b4" }}>{item.label}</span>
            {activeTab === item.id && <div style={{ position: "absolute", bottom: 0, width: 24, height: 3, borderRadius: "3px 3px 0 0", background: "#1a7a6a" }} />}
          </button>
        ))}
      </div>

    {/* ═══ MODAL PLATFORM FEE ═══ */}
    {feeModalOpen && (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }} onClick={() => setFeeModalOpen(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#f4f7fb", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "92vh", overflowY: "auto", paddingBottom: 32 }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", padding: "20px 20px 18px", borderRadius: "24px 24px 0 0", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>🏷️ Platform Fee</div>
              <button onClick={() => setFeeModalOpen(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, color: "#fff", width: 32, height: 32, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {feeDetailLoading ? (
              <div style={{ textAlign: "center", padding: "12px 0", opacity: 0.7, fontSize: 14 }}>Memuat...</div>
            ) : feeDetail ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>Total Tagihan</div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{fmtRp(feeDetail.totalAllFees)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>Sudah Diverif</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#86efac" }}>{fmtRp(feeDetail.totalVerified)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>Sisa Tagihan</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: feeDetail.totalPending > 0 ? "#fca5a5" : "#86efac" }}>{fmtRp(feeDetail.totalPending)}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ padding: "16px 16px 0" }}>
            {/* Deadline warning */}
            {feeDetail && feeDetail.totalPending > 0 && feeDetail.suspendDeadline && (
              <div style={{ background: (feeDetail.daysUntilSuspend ?? 99) < 0 ? "#fef2f2" : "#fff7ed", border: `1px solid ${(feeDetail.daysUntilSuspend ?? 99) < 0 ? "#fca5a5" : "#fdba74"}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: (feeDetail.daysUntilSuspend ?? 99) < 0 ? "#dc2626" : "#ea580c", marginBottom: 2 }}>
                  {(feeDetail.daysUntilSuspend ?? 99) < 0 ? "⛔ Batas Waktu Terlewat!" : `⚠️ Deadline: ${feeDetail.suspendDeadline}`}
                </div>
                <div style={{ fontSize: 12, color: (feeDetail.daysUntilSuspend ?? 99) < 0 ? "#b91c1c" : "#c2410c" }}>
                  {(feeDetail.daysUntilSuspend ?? 99) < 0
                    ? "Segera lunasi untuk menghindari suspend akun."
                    : `Sisa ${feeDetail.daysUntilSuspend} hari untuk melunasi tagihan.`}
                </div>
              </div>
            )}

            {/* Bank account info */}
            {feeDetail && feeDetail.totalPending > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 12 }}>🏦 Transfer ke Rekening RIDE</div>
                <div style={{ background: "#f4f7fb", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 2 }}>Nama Rekening</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>PT ALVI UTAMA KARYA</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 1 }}>Bank</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a5c" }}>BNI</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: "#e0e8f0" }} />
                    <div>
                      <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 1 }}>No. Rekening</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#1a3a5c", letterSpacing: 1 }}>1788471839</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Upload bukti pembayaran */}
            {feeDetail && feeDetail.totalPending > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 12 }}>📤 Kirim Bukti Pembayaran</div>
                {paySuccess && (
                  <div style={{ background: "rgba(26,122,106,0.1)", border: "1px solid rgba(26,122,106,0.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>✅</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7a6a" }}>Bukti berhasil dikirim!</div>
                    <div style={{ fontSize: 11, color: "#7a8a9a", marginTop: 2 }}>Admin akan memverifikasi dalam 1x24 jam.</div>
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 6 }}>Jumlah yang ditransfer (Rp)</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={feeDetail.totalPending.toLocaleString("id-ID")}
                    value={payAmount}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits === "") { setPayAmount(""); return; }
                      setPayAmount(parseInt(digits, 10).toLocaleString("id-ID"));
                    }}
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 15, fontWeight: 600, color: "#1a2a3a", boxSizing: "border-box", outline: "none" }}
                  />
                  <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 4 }}>Sisa tagihan: {fmtRp(feeDetail.totalPending)} — boleh cicil</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 6 }}>Foto bukti transfer</div>
                  {payProofPreview ? (
                    <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#f4f7fb" }}>
                      <img src={payProofPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="bukti" />
                      <button onClick={() => { setPayProof(null); setPayProofPreview(null); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 8, color: "#fff", width: 28, height: 28, fontSize: 14, cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", padding: "20px", borderRadius: 12, border: "2px dashed #d0dce8", background: "#f9fafb", cursor: "pointer", gap: 6 }}>
                      <span style={{ fontSize: 28 }}>📷</span>
                      <span style={{ fontSize: 12, color: "#9aa5b4" }}>Tap untuk pilih foto bukti transfer</span>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setPayProof(f);
                          const reader = new FileReader();
                          reader.onload = ev => setPayProofPreview(ev.target?.result as string);
                          reader.readAsDataURL(f);
                        }
                      }} />
                    </label>
                  )}
                </div>
                <button
                  onClick={submitFeePayment}
                  disabled={!payProof || !payAmount || parseInt(payAmount.replace(/\D/g, "")) <= 0 || paySubmitting}
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: (!payProof || !payAmount || parseInt(payAmount.replace(/\D/g, "")) <= 0) ? "#d0dce8" : "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: (!payProof || !payAmount || parseInt(payAmount.replace(/\D/g, "")) <= 0) ? "not-allowed" : "pointer" }}
                >
                  {paySubmitting ? "Mengirim..." : "Kirim Bukti Pembayaran"}
                </button>
              </div>
            )}

            {/* Riwayat pembayaran */}
            {feeDetail && feeDetail.payments.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 12 }}>📋 Riwayat Pengajuan</div>
                {feeDetail.payments.map((p, i) => {
                  const statusColor = p.status === "verified" ? "#1a7a6a" : p.status === "rejected" ? "#dc2626" : "#f59e0b";
                  const statusBg = p.status === "verified" ? "rgba(26,122,106,0.08)" : p.status === "rejected" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.08)";
                  const statusIcon = p.status === "verified" ? "✅" : p.status === "rejected" ? "❌" : "⏳";
                  const statusLabel = p.status === "verified" ? "Diverifikasi" : p.status === "rejected" ? "Ditolak" : "Menunggu";
                  return (
                    <div key={p.id}>
                      {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "10px 0" }} />}
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{fmtRp(p.amountClaimed)}</span>
                            <span style={{ fontSize: 10, background: statusBg, color: statusColor, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{statusIcon} {statusLabel}</span>
                          </div>
                          {p.amountVerified != null && p.status === "verified" && (
                            <div style={{ fontSize: 11, color: "#1a7a6a", marginBottom: 2 }}>Diverif: {fmtRp(p.amountVerified)}</div>
                          )}
                          {p.notes && (
                            <div style={{ fontSize: 11, color: "#7a8a9a", marginBottom: 2 }}>Catatan: {p.notes}</div>
                          )}
                          <div style={{ fontSize: 10, color: "#9aa5b4" }}>{fmtDate(p.createdAt)}</div>
                        </div>
                        <a href={`${BASE}/api${p.proofPhotoPath}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: "#f4f7fb", flexShrink: 0 }}>
                            <img src={`${BASE}/api${p.proofPhotoPath}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="bukti" />
                          </div>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rincian per minggu */}
            {feeDetail && feeDetail.weeks.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 12 }}>📅 Rincian per Minggu</div>
                {feeDetail.weeks.map((w, i) => (
                  <div key={i}>
                    {i > 0 && <div style={{ height: 1, background: "#f0f4f8", margin: "8px 0" }} />}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a2a3a" }}>{w.weekStart} – {w.weekEnd}</div>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>Omset: {fmtRp(w.omset)} · {w.orderCount} order</div>
                        <div style={{ fontSize: 10, color: "#c2410c", marginTop: 1 }}>Deadline: {w.deadline}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ea580c" }}>{fmtRp(w.fee)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lunas state */}
            {feeDetail && feeDetail.totalPending === 0 && (
              <div style={{ textAlign: "center", padding: "28px 16px" }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a6a", marginBottom: 4 }}>Platform Fee Lunas!</div>
                <div style={{ fontSize: 13, color: "#7a8a9a" }}>Terima kasih sudah menjaga kepercayaan RIDE.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    </div>
  );
}
