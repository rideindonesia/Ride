import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";
import { usePushNotification } from "../hooks/usePushNotification";
import { useRideToast, RideToastContainer } from "../components/RideToast";
import { loadTarif } from "../utils/pricing";

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
  damageCategories: string[] | null; pickupAddress: string | null; status: string;
  totalAmount: number; paymentData: { biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string } | null;
  createdAt: string; rating?: number | null; reviewComment?: string | null; mitraName?: string | null;
  cancelReason?: string | null; canceledBy?: string | null;
};

const SVC_CFG: Record<string, { emoji: string; label: string; serviceLabel: string; route: string }> = {
  bengkel:   { emoji: "🔧", label: "Ride Auto",        serviceLabel: "Bengkel Panggilan",   route: "/order/bengkel" },
  elektronik:{ emoji: "💡", label: "Ride Service",     serviceLabel: "Elektronik Panggilan", route: "/order/elektronik" },
  cuci:      { emoji: "🚿", label: "Ride Wash",        serviceLabel: "Cuci Kendaraan",      route: "/order/cuci" },
  barber:    { emoji: "✂️", label: "Ride Barber",      serviceLabel: "Barber Panggilan",    route: "/order/barber" },
  inspeksi:  { emoji: "🔍", label: "Ride Inspection",  serviceLabel: "Inspeksi Kendaraan",  route: "/order/inspeksi" },
  towing:    { emoji: "🚛", label: "Ride Towing",      serviceLabel: "Towing & Derek",      route: "/order/towing" },
};
const getSvc = (t: string) => SVC_CFG[t] ?? { emoji: "🔧", label: t, serviceLabel: t, route: "/" };
const fmtRp = (n: number | null | undefined) => "Rp " + (n ?? 0).toLocaleString("id-ID");
const fmtDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
};

export default function DashboardPengguna() {
  usePushNotification(true);
  const { toasts, showToast, removeToast } = useRideToast();
  const [, navigate] = useLocation();
  const [user, setUser] = useState<{ name: string; id: number } | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [address, setAddress] = useState<string>("Mendeteksi lokasi...");
  const [onlineMitra, setOnlineMitra] = useState<OnlineMitra[]>([]);
  const [mitraFilter, setMitraFilter] = useState<"all" | "repair" | "towing" | "care">("all");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickLat, setPickLat] = useState<number | null>(null);
  const [pickLng, setPickLng] = useState<number | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const notifCount = unreadChat;
  const [activeVouchers, setActiveVouchers] = useState<{ id: number; code: string; discountType: string; discountValue: number; minOrder: number; maxDiscount: number | null; description: string | null; expiresAt: string | null }[]>([]);
  const [activeVouchersLoaded, setActiveVouchersLoaded] = useState(false);
  const fetchActiveVouchers = async () => {
    try {
      const r = await fetch("/api/pengguna/vouchers/active", { credentials: "include" });
      const d = await r.json();
      setActiveVouchers(d.vouchers ?? []);
      setActiveVouchersLoaded(true);
    } catch {}
  };
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
  // Cancel order modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOther, setCancelOther] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [chatHistoryOrderId, setChatHistoryOrderId] = useState<number | null>(null);
  const [chatHistoryMsgs, setChatHistoryMsgs] = useState<ChatMsg[]>([]);
  const [loadingChatHistory, setLoadingChatHistory] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Akun section states
  const [openAkunSection, setOpenAkunSection] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: number; name: string; email: string; phone: string | null; createdAt: string; profilePhotoPath: string | null } | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameLoading, setEditNameLoading] = useState(false);
  const [editNameMsg, setEditNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [cpOld, setCpOld] = useState(""); const [cpNew, setCpNew] = useState(""); const [cpConfirm, setCpConfirm] = useState("");
  const [cpLoading, setCpLoading] = useState(false);
  const [cpMsg, setCpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [notifSettings, setNotifSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ride-notif-p") ?? "null") ?? { pesanan: true, chat: true, promo: true, pengingat: false }; } catch { return { pesanan: true, chat: true, promo: true, pengingat: false }; }
  });
  const [alamatList, setAlamatList] = useState<{ id: string; label: string; address: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("ride-alamat") ?? "[]"); } catch { return []; }
  });
  const [newAlamatLabel, setNewAlamatLabel] = useState("");
  const [newAlamatAddr, setNewAlamatAddr] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherMsg, setVoucherMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Edit phone/email
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  // OTP modal
  const [otpPending, setOtpPending] = useState<{ field: "phone" | "email"; value: string; demoOtp?: string } | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Profile photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Level helper
  const getLevel = (orders: number) => {
    if (orders >= 50) return { label: "Platinum", color: "#1a3a5c", bg: "#e8f0f8" };
    if (orders >= 20) return { label: "Gold", color: "#b8860b", bg: "#fef9e7" };
    if (orders >= 5) return { label: "Silver", color: "#607d8b", bg: "#f0f4f8" };
    return { label: "Bronze", color: "#8d6e63", bg: "#fdf1ee" };
  };

  // Profile save loading
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [profileSaveMsg, setProfileSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Default address
  const [defaultAlamatId, setDefaultAlamatId] = useState<string | null>(() => {
    try { return localStorage.getItem("ride-default-alamat"); } catch { return null; }
  });

  // Login history (simulated)
  const loginHistory = [
    { device: "Chrome · Android", time: "16 Apr 2026, 10:30 WIB", current: true },
    { device: "Chrome · Windows", time: "14 Apr 2026, 18:45 WIB", current: false },
    { device: "Safari · iPhone", time: "10 Apr 2026, 09:12 WIB", current: false },
  ];

  // Voucher usage history — now empty (no history API; vouchers used at checkout)
  const voucherHistory: { code: string; desc: string; usedAt: string; order: string }[] = [];

  // Report / ticket
  const [reportInput, setReportInput] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [reportType, setReportType] = useState("order");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMsg, setReportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [reportList, setReportList] = useState<{ id: number; title: string; status: string; type: string; createdAt: string }[]>([]);

  // Rating (review) modal — per order dari history
  const [reviewModal, setReviewModal] = useState<{ open: boolean; orderId: number | null; orderNo: string } >({ open: false, orderId: null, orderNo: "" });
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Laporan masalah modal — per order dari history
  const [laporModal, setLaporModal] = useState<{ open: boolean; orderId: number | null; orderNo: string }>({ open: false, orderId: null, orderNo: "" });
  const [laporType, setLaporType] = useState("order");
  const [laporMessage, setLaporMessage] = useState("");
  const [laporSubmitting, setLaporSubmitting] = useState(false);

  // Keamanan sub-section
  const [keamananSubSection, setKeamananSubSection] = useState<string | null>(null);

  // Edit alamat
  const [editingAlamatId, setEditingAlamatId] = useState<string | null>(null);
  const [editAlamatLabel, setEditAlamatLabel] = useState("");
  const [editAlamatAddr, setEditAlamatAddr] = useState("");

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const mitraMarkersRef = useRef<L.CircleMarker[]>([]);
  const watchIdRef = useRef<number | null>(null);

  const pickerMapRef = useRef<HTMLDivElement>(null);
  const pickerLeafletRef = useRef<L.Map | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);
  const activeMitraMarkerRef = useRef<L.Marker | null>(null);

  // Load logged in user
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.id) {
          setUser({ id: d.id, name: d.name });
          identifySocket(d.id, "pengguna");
        } else navigate("/login");
      })
      .catch(() => navigate("/login"));
    return () => { socket.disconnect(); };
  }, [navigate]);

  // Poll active order every 30s (backup) — primary update via socket
  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json())
        .then(d => setActiveOrder(d.order ?? null))
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);

  // Socket: real-time order events for pengguna
  useEffect(() => {
    const onAccepted = (data: any) => {
      setActiveOrder(prev => prev ? {
        ...prev,
        status: "accepted",
        mitraId: data.mitraId,
        mitraName: data.mitraName,
        mitraLat: data.mitraLat,
        mitraLng: data.mitraLng,
      } : prev);
      showToast({ icon: "✅", title: "Mitra Ditemukan!", body: `${data.mitraName || "Mitra"} menerima pesanan Anda`, color: "green" });
      // Refresh full order data
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json()).then(d => { if (d.order) setActiveOrder(d.order); }).catch(() => {});
    };
    const onPhase = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, trackingPhase: data.phase } : prev);
      const phaseToast: Record<string, { icon: string; title: string; body: string; color: "green"|"blue"|"orange"|"red"|"purple" }> = {
        tiba:       { icon: "📍", title: "Mitra Sudah Tiba!", body: "Mitra sudah tiba di lokasi Anda", color: "blue" },
        pengerjaan: { icon: "🔧", title: "Pengerjaan Dimulai", body: "Mitra sedang mengerjakan pesanan Anda", color: "orange" },
        selesai:    { icon: "🎉", title: "Layanan Selesai", body: "Silakan lakukan pembayaran", color: "green" },
      };
      if (phaseToast[data.phase]) showToast(phaseToast[data.phase]);
    };
    const onPayment = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, paymentData: data.paymentData } : prev);
      showToast({ icon: "💳", title: "Rincian Biaya Dikirim", body: "Mitra mengirim rincian biaya layanan", color: "blue" });
    };
    const onDone = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, status: "done" } : prev);
      showToast({ icon: "⭐", title: "Pesanan Selesai!", body: "Beri ulasan untuk mitra Anda", color: "green", duration: 6000 });
      // Refresh full order + history
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json()).then(d => setActiveOrder(d.order ?? null)).catch(() => {});
      fetch("/api/pengguna/order-history", { credentials: "include" })
        .then(r => r.json()).then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); }).catch(() => {});
    };
    const onOrderCancelled = (data: { orderId: number; canceledBy?: string; cancelReason?: string }) => {
      // Hanya proses jika order ini milik pengguna
      setActiveOrder(prev => {
        if (!prev || prev.id !== data.orderId) return prev;
        return null;
      });
      if (data.canceledBy === "mitra") {
        const reasonText = data.cancelReason ? `Alasan: ${data.cancelReason}` : "Mitra membatalkan pesanan Anda.";
        showToast({ icon: "❌", title: "Pesanan Dibatalkan Mitra", body: reasonText, color: "red", duration: 8000 });
      }
      // Refresh history agar status terbaru tampil
      fetch("/api/pengguna/order-history", { credentials: "include" })
        .then(r => r.json()).then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); }).catch(() => {});
    };
    socket.on("order:accepted", onAccepted);
    socket.on("order:phase", onPhase);
    socket.on("order:payment", onPayment);
    socket.on("order:done", onDone);
    socket.on("order:cancelled", onOrderCancelled);
    return () => {
      socket.off("order:accepted", onAccepted);
      socket.off("order:phase", onPhase);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
      socket.off("order:cancelled", onOrderCancelled);
    };
  }, [showToast]);

  // Load tarif dinamis dari DB
  useEffect(() => { loadTarif(); }, []);

  // Fetch order history (done + cancelled)
  const refreshHistory = () => {
    fetch("/api/pengguna/order-history", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); })
      .catch(() => {});
  };
  useEffect(() => { refreshHistory(); }, []);

  // Submit rating & ulasan
  const submitReview = async () => {
    if (!reviewModal.orderId || reviewStars === 0 || reviewSubmitting) return;
    setReviewSubmitting(true);
    try {
      const r = await fetch(`/api/pengguna/orders/${reviewModal.orderId}/review`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewStars, comment: reviewComment.trim() || undefined }),
      });
      if (r.ok) {
        showToast({ type: "success", title: "Ulasan terkirim!", message: `Rating ${reviewStars}⭐ berhasil disimpan.` });
        setReviewModal({ open: false, orderId: null, orderNo: "" });
        setReviewStars(0); setReviewComment("");
        refreshHistory();
      } else {
        showToast({ type: "error", title: "Gagal", message: "Ulasan gagal dikirim." });
      }
    } catch { showToast({ type: "error", title: "Gagal", message: "Terjadi kesalahan." }); }
    setReviewSubmitting(false);
  };

  // Submit laporan masalah dari history order
  const submitLaporan = async () => {
    if (!laporModal.orderId || !laporMessage.trim() || laporSubmitting) return;
    setLaporSubmitting(true);
    try {
      const r = await fetch("/api/pengguna/reports", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: laporType,
          title: `Masalah Order #${laporModal.orderNo}`,
          message: laporMessage.trim(),
          orderId: laporModal.orderId,
          orderNo: laporModal.orderNo,
        }),
      });
      if (r.ok) {
        showToast({ type: "success", title: "Laporan terkirim!", message: "Tim RIDE akan memproses laporan Anda segera." });
        setLaporModal({ open: false, orderId: null, orderNo: "" });
        setLaporMessage(""); setLaporType("order");
      } else {
        showToast({ type: "error", title: "Gagal", message: "Laporan gagal dikirim." });
      }
    } catch { showToast({ type: "error", title: "Gagal", message: "Terjadi kesalahan." }); }
    setLaporSubmitting(false);
  };

  // Fetch active vouchers
  useEffect(() => {
    fetch("/api/pengguna/vouchers/active", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.vouchers)) setActiveVouchers(d.vouchers); })
      .catch(() => {});
  }, []);

  // Fetch reports
  useEffect(() => {
    fetch("/api/pengguna/reports", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.reports)) setReportList(d.reports); })
      .catch(() => {});
  }, []);

  // Fetch profil pengguna (untuk tab Akun)
  useEffect(() => {
    fetch("/api/pengguna/profile", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.id) { setProfile(d); setEditName(d.name); setEditPhone(d.phone ?? ""); setEditEmail(d.email ?? ""); } })
      .catch(() => {});
  }, []);

  // Sync notif settings to localStorage
  useEffect(() => {
    localStorage.setItem("ride-notif-p", JSON.stringify(notifSettings));
  }, [notifSettings]);

  // Sync alamat to localStorage
  useEffect(() => {
    localStorage.setItem("ride-alamat", JSON.stringify(alamatList));
  }, [alamatList]);

  // Sync default alamat to localStorage
  useEffect(() => {
    if (defaultAlamatId) localStorage.setItem("ride-default-alamat", defaultAlamatId);
    else localStorage.removeItem("ride-default-alamat");
  }, [defaultAlamatId]);


  // Handle profile save (name + phone/email with OTP)
  const handleProfileSave = async () => {
    if (!profile) return;
    setProfileSaveLoading(true); setProfileSaveMsg(null);
    try {
      // Save name if changed
      if (editName.trim() && editName.trim() !== profile.name) {
        const r = await fetch("/api/pengguna/profile", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName.trim() }) });
        const d = await r.json();
        if (!d.ok) { setProfileSaveMsg({ type: "err", text: d.error ?? "Gagal update nama" }); setProfileSaveLoading(false); return; }
        setProfile(p => p ? { ...p, name: editName.trim() } : p);
      }
      // Phone changed → request OTP
      if (editPhone.trim() && editPhone.trim() !== (profile.phone ?? "")) {
        const r = await fetch("/api/pengguna/request-profile-otp", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "phone", value: editPhone.trim() }) });
        const d = await r.json();
        if (!d.ok) { setProfileSaveMsg({ type: "err", text: d.error ?? "Gagal kirim OTP" }); setProfileSaveLoading(false); return; }
        setOtpPending({ field: "phone", value: editPhone.trim(), demoOtp: d.otpDemo });
        setOtpInput(""); setOtpMsg(null); setProfileSaveLoading(false); return;
      }
      // Email changed → request OTP
      if (editEmail.trim() && editEmail.trim() !== profile.email) {
        const r = await fetch("/api/pengguna/request-profile-otp", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "email", value: editEmail.trim() }) });
        const d = await r.json();
        if (!d.ok) { setProfileSaveMsg({ type: "err", text: d.error ?? "Gagal kirim OTP" }); setProfileSaveLoading(false); return; }
        setOtpPending({ field: "email", value: editEmail.trim(), demoOtp: d.otpDemo });
        setOtpInput(""); setOtpMsg(null); setProfileSaveLoading(false); return;
      }
      setProfileSaveMsg({ type: "ok", text: "Profil berhasil diperbarui!" });
    } catch { setProfileSaveMsg({ type: "err", text: "Terjadi kesalahan, coba lagi" }); }
    setProfileSaveLoading(false);
  };

  // Handle OTP verification
  const handleVerifyOtp = async () => {
    if (!otpPending || !otpInput.trim()) return;
    setOtpLoading(true); setOtpMsg(null);
    const r = await fetch("/api/pengguna/verify-profile-otp", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp: otpInput.trim() }) });
    const d = await r.json();
    setOtpLoading(false);
    if (d.ok) {
      setProfile(p => p ? { ...p, [d.field]: d.value } : p);
      setOtpPending(null); setOtpInput("");
      setProfileSaveMsg({ type: "ok", text: `${d.field === "phone" ? "Nomor HP" : "Email"} berhasil diperbarui!` });
    } else setOtpMsg({ type: "err", text: d.error ?? "Kode OTP tidak valid" });
  };

  // Handle photo upload
  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setPhotoUploading(true);
    const formData = new FormData();
    formData.append("photo", photoFile);
    const r = await fetch("/api/pengguna/upload-photo", { method: "POST", credentials: "include", body: formData });
    const d = await r.json();
    setPhotoUploading(false);
    if (d.ok) { setProfile(p => p ? { ...p, profilePhotoPath: d.photoUrl } : p); setPhotoFile(null); setPhotoPreview(null); setProfileSaveMsg({ type: "ok", text: "Foto profil berhasil diperbarui!" }); }
    else setProfileSaveMsg({ type: "err", text: d.error ?? "Gagal upload foto" });
  };

  // Join order room and listen to chat via socket when activeOrder changes
  useEffect(() => {
    if (!activeOrder) { setChatMsgs([]); return; }
    const orderId = activeOrder.id;

    // Fetch initial messages
    fetch(`/api/chat/${orderId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.messages)) {
          setChatMsgs(d.messages);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      }).catch(() => {});

    // Join socket room for real-time chat
    joinOrderRoom(orderId);

    // Listen for incoming chat messages
    const onChat = (data: any) => {
      if (data.orderId !== orderId) return;
      setChatMsgs(prev => {
        if (prev.some(m => m.id === data.id)) return prev;
        const next = [...prev, data];
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        return next;
      });
      // Increment unread badge jika pesan dari mitra dan user tidak di tab chat
      if (data.senderRole !== "pengguna") {
        setUnreadChat(c => c + 1);
      }
    };
    socket.on("chat:message", onChat);

    return () => {
      leaveOrderRoom(orderId);
      socket.off("chat:message", onChat);
    };
  }, [activeOrder?.id]);

  // Socket: terima update lokasi mitra real-time saat order aktif
  useEffect(() => {
    const onMitraLocation = (data: { lat: number; lng: number; speedKmh: number }) => {
      const map = leafletMapRef.current;
      if (!map) return;
      if (activeMitraMarkerRef.current) {
        activeMitraMarkerRef.current.setLatLng([data.lat, data.lng]);
      } else {
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#1a3a5c,#1a7a6a);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏍️</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], className: "",
        });
        activeMitraMarkerRef.current = L.marker([data.lat, data.lng], { icon })
          .addTo(map)
          .bindTooltip("Mitra menuju lokasi Anda", { permanent: false });
      }
    };
    socket.on("mitra:location", onMitraLocation);
    return () => {
      socket.off("mitra:location", onMitraLocation);
      // Hapus marker saat cleanup (order selesai/dibatalkan)
      activeMitraMarkerRef.current?.remove();
      activeMitraMarkerRef.current = null;
    };
  }, []);

  const sendChat = async () => {
    if (!chatInput.trim() || !activeOrder || chatSending) return;
    setChatSending(true);
    const msg = chatInput.trim();
    setChatInput("");
    const r = await fetch(`/api/chat/${activeOrder.id}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    }).catch(() => null);
    if (r?.status === 401) {
      alert("Sesi Anda telah habis. Silakan login ulang.");
      window.location.href = "/";
      return;
    }
    setChatSending(false);
  };

  const doCancelOrder = async () => {
    if (!activeOrder || cancelling) return;
    const reason = cancelReason === "Lainnya" ? cancelOther.trim() : cancelReason;
    if (!reason) return;
    setCancelling(true);
    await fetch(`/api/pengguna/orders/${activeOrder.id}`, {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelReason: reason }),
    }).catch(() => null);
    setCancelling(false);
    setCancelModalOpen(false);
    setCancelReason("");
    setCancelOther("");
    setActiveOrder(null);
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

  // Filter mitra by category
  const FILTER_SVC: Record<string, string[]> = {
    repair: ["bengkel", "inspeksi", "elektronik"],
    towing: ["towing"],
    care: ["barber", "cuci"],
  };
  const filteredMitra = mitraFilter === "all" ? onlineMitra : onlineMitra.filter(m => (FILTER_SVC[mitraFilter] ?? []).includes(m.serviceType));

  // Update mitra markers
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    mitraMarkersRef.current.forEach(m => m.remove());
    mitraMarkersRef.current = [];
    filteredMitra.forEach(mitra => {
      const marker = L.circleMarker([mitra.lat, mitra.lng], {
        radius: 8, color: "#16a34a", fillColor: "#22c55e", fillOpacity: 1, weight: 2,
      }).bindTooltip(`<b>${mitra.name}</b><br/>${mitra.serviceType}`, { permanent: false }).addTo(map);
      mitraMarkersRef.current.push(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMitra]);

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
      <RideToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ── Cancel Order Modal ── */}
      {cancelModalOpen && activeOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => !cancelling && setCancelModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "24px 20px 20px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", textAlign: "center", marginBottom: 4 }}>Batalkan Pesanan?</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", textAlign: "center", marginBottom: 18, lineHeight: 1.5 }}>
              {activeOrder.mitraName
                ? `Mitra ${activeOrder.mitraName} sedang dalam perjalanan. Pembatalan dapat mempengaruhi kepercayaan.`
                : "Order Anda masih mencari mitra. Pembatalan tidak dikenakan biaya."}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4a5a6a", marginBottom: 8 }}>Alasan pembatalan:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {["Saya berubah pikiran", "Menemukan mitra sendiri", "Order dibuat salah", "Terlalu lama menunggu", "Lainnya"].map(opt => (
                <button key={opt} onClick={() => { setCancelReason(opt); if (opt !== "Lainnya") setCancelOther(""); }}
                  style={{ textAlign: "left", padding: "10px 14px", borderRadius: 12, border: cancelReason === opt ? "2px solid #dc2626" : "1.5px solid #e0e8f0", background: cancelReason === opt ? "#fef2f2" : "#fff", fontSize: 13, color: cancelReason === opt ? "#dc2626" : "#4a5a6a", fontWeight: cancelReason === opt ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 8, border: cancelReason === opt ? "5px solid #dc2626" : "2px solid #d0dce8", flexShrink: 0 }} />
                  {opt}
                </button>
              ))}
              {cancelReason === "Lainnya" && (
                <textarea value={cancelOther} onChange={e => setCancelOther(e.target.value)}
                  placeholder="Tuliskan alasan pembatalan..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, color: "#1a2a3a", resize: "none", outline: "none", minHeight: 72, fontFamily: "inherit", boxSizing: "border-box" }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setCancelModalOpen(false)} disabled={cancelling}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 14, fontWeight: 700, color: "#4a5a6a", cursor: "pointer" }}>
                Kembali
              </button>
              <button onClick={doCancelOrder}
                disabled={cancelling || !cancelReason || (cancelReason === "Lainnya" && !cancelOther.trim())}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: cancelling || !cancelReason ? "#fca5a5" : "#dc2626", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: !cancelReason || (cancelReason === "Lainnya" && !cancelOther.trim()) ? 0.6 : 1 }}>
                {cancelling ? "Membatalkan..." : "Ya, Batalkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rating / Review Modal ── */}
      {reviewModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => !reviewSubmitting && setReviewModal({ open: false, orderId: null, orderNo: "" })}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "24px 20px 20px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>⭐</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", textAlign: "center", marginBottom: 4 }}>Beri Ulasan</div>
            <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center", marginBottom: 20 }}>Order #{reviewModal.orderNo}</div>
            {/* Bintang */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
              {[1,2,3,4,5].map(s => (
                <button key={s}
                  onMouseEnter={() => setReviewHover(s)}
                  onMouseLeave={() => setReviewHover(0)}
                  onClick={() => setReviewStars(s)}
                  style={{ fontSize: 36, background: "none", border: "none", cursor: "pointer", lineHeight: 1, color: s <= (reviewHover || reviewStars) ? "#f59e0b" : "#e0e8f0", transition: "color 0.1s" }}>★</button>
              ))}
            </div>
            {reviewStars > 0 && <div style={{ textAlign: "center", fontSize: 13, color: "#d97706", fontWeight: 700, marginBottom: 12 }}>
              {["", "Sangat Buruk", "Buruk", "Cukup", "Baik", "Sangat Baik"][reviewStars]}
            </div>}
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
              placeholder="Tulis komentar (opsional)..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, color: "#1a2a3a", resize: "none", outline: "none", minHeight: 72, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setReviewModal({ open: false, orderId: null, orderNo: "" })} disabled={reviewSubmitting}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 14, fontWeight: 700, color: "#4a5a6a", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={submitReview} disabled={reviewSubmitting || reviewStars === 0}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: reviewStars > 0 ? "#f59e0b" : "#e0e8f0", fontSize: 14, fontWeight: 700, color: "#fff", cursor: reviewStars > 0 ? "pointer" : "default" }}>
                {reviewSubmitting ? "Mengirim..." : "Kirim Ulasan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Laporkan Masalah Modal ── */}
      {laporModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => !laporSubmitting && setLaporModal({ open: false, orderId: null, orderNo: "" })}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "24px 20px 20px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", textAlign: "center", marginBottom: 4 }}>Laporkan Masalah</div>
            <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center", marginBottom: 16 }}>Order #{laporModal.orderNo}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4a5a6a", marginBottom: 8 }}>Kategori laporan:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { v: "order", l: "Masalah Order" },
                { v: "payment", l: "Pembayaran" },
                { v: "mitra", l: "Mitra" },
                { v: "app", l: "Aplikasi" },
              ].map(t => (
                <button key={t.v} onClick={() => setLaporType(t.v)}
                  style={{ padding: "8px 14px", borderRadius: 20, border: laporType === t.v ? "2px solid #1a3a5c" : "1.5px solid #e0e8f0", background: laporType === t.v ? "#f0f4f8" : "#fff", fontSize: 12, fontWeight: laporType === t.v ? 700 : 500, color: laporType === t.v ? "#1a3a5c" : "#7a8a9a", cursor: "pointer" }}>
                  {t.l}
                </button>
              ))}
            </div>
            <textarea value={laporMessage} onChange={e => setLaporMessage(e.target.value)}
              placeholder="Ceritakan masalah Anda secara detail..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 13, color: "#1a2a3a", resize: "none", outline: "none", minHeight: 88, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setLaporModal({ open: false, orderId: null, orderNo: "" })} disabled={laporSubmitting}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", fontSize: 14, fontWeight: 700, color: "#4a5a6a", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={submitLaporan} disabled={laporSubmitting || !laporMessage.trim()}
                style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: laporMessage.trim() ? "#1a3a5c" : "#e0e8f0", fontSize: 14, fontWeight: 700, color: "#fff", cursor: laporMessage.trim() ? "pointer" : "default" }}>
                {laporSubmitting ? "Mengirim..." : "Kirim Laporan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-page top bar — shown for non-beranda tabs */}
      {activeTab !== "beranda" && (
        <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "44px 16px 14px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button onClick={() => setActiveTab("beranda")} style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.18)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0, letterSpacing: "-1px" }}>
            &lt;-
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
            {activeTab === "pesanan" ? "Pesanan" : activeTab === "chat" ? "Chat" : "Akun Saya"}
          </div>
        </div>
      )}

      {/* Header dark — Beranda only */}
      {activeTab === "beranda" && <div style={{ background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 60%, #1a7a6a 100%)", padding: "48px 14px 16px", flexShrink: 0 }}>
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
      </div>}

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

          {/* Voucher / Promo banner */}
          {activeVouchers.length > 0 ? activeVouchers.slice(0, 3).map(v => {
            const isPercent = v.discountType === "percent";
            const valLabel = isPercent ? `${v.discountValue}%` : `Rp ${v.discountValue.toLocaleString("id-ID")}`;
            const expiry = v.expiresAt ? new Date(v.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : null;
            return (
              <div key={v.id} style={{ borderRadius: 16, background: "linear-gradient(135deg, #ea580c 0%, #f97316 100%)", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>🎁 {v.description || `Diskon ${valLabel}`}</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4 }}>
                    Kode: <span style={{ fontWeight: 800, letterSpacing: 1 }}>{v.code}</span>
                    {v.minOrder > 0 && ` · Min. Rp ${v.minOrder.toLocaleString("id-ID")}`}
                    {expiry && ` · s/d ${expiry}`}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 12px", textAlign: "center", flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ color: "#fff", fontSize: isPercent ? 18 : 13, fontWeight: 900, lineHeight: 1 }}>{valLabel}</div>
                  <div style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>OFF</div>
                </div>
              </div>
            );
          }) : (
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
          )}

          {/* Mitra Terdekat */}
          <div style={{ background: "#fff", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a3a" }}>Mitra Terdekat</div>
                <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 2 }}>Tap pin untuk lihat detail</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { icon: "🔧", filter: "repair" as const, label: "Servis" },
                  { icon: "🚛", filter: "towing" as const, label: "Towing" },
                  { icon: "✂️", filter: "care" as const, label: "Perawatan" },
                ] as const).map(({ icon, filter, label }) => {
                  const isActive = mitraFilter === filter;
                  return (
                    <button key={filter} title={label}
                      onClick={() => setMitraFilter(isActive ? "all" : filter)}
                      style={{ width: 36, height: 36, borderRadius: 10, background: isActive ? "#1a3a5c" : "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer", border: isActive ? "2px solid #1a3a5c" : "2px solid transparent", transition: "all 0.18s" }}>
                      {icon}
                    </button>
                  );
                })}
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
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{filteredMitra.length}{mitraFilter !== "all" ? ` / ${onlineMitra.length}` : ""} online</span>
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
              <div>
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
                {/* Cancel button — only allowed while still searching for mitra (before mitra accepts) */}
                {!activeOrder.mitraName && activeOrder.trackingPhase !== "selesai" && activeOrder.trackingPhase !== "pengerjaan" && activeOrder.trackingPhase !== "tiba" ? (
                  <button onClick={() => { setCancelReason(""); setCancelOther(""); setCancelModalOpen(true); }}
                    style={{ marginTop: 10, width: "100%", padding: "11px", borderRadius: 14, border: "1.5px solid #fca5a5", background: "rgba(254,226,226,0.7)", color: "#dc2626", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    ✕ Batalkan Pesanan
                  </button>
                ) : activeOrder.mitraName && activeOrder.trackingPhase !== "selesai" && activeOrder.trackingPhase !== "pengerjaan" ? (
                  <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 14, background: "#f0f9f6", border: "1.5px solid #a7f3d0", color: "#065f46", fontSize: 12, fontWeight: 600, textAlign: "center" as const }}>
                    🔒 Pesanan tidak dapat dibatalkan — mitra sedang dalam perjalanan menuju lokasi Anda
                  </div>
                ) : null}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {orderHistory.map(o => {
                  const svc = getSvc(o.serviceType);
                  const isOpen = expandedHistoryId === o.id;
                  const pd = o.paymentData;
                  const keluhan = Array.isArray(o.damageCategories) ? o.damageCategories.join(", ") : "-";
                  const mitraInitial = o.mitraName ? o.mitraName.charAt(0).toUpperCase() : svc.emoji;
                  const hasMitraName = !!o.mitraName;
                  return (
                    <div key={o.id} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                      {/* Card header */}
                      <button onClick={() => setExpandedHistoryId(isOpen ? null : o.id)} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" as const }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          {/* Avatar / icon */}
                          <div style={{ width: 46, height: 46, borderRadius: 23, background: o.status === "cancelled" ? "rgba(220,38,38,0.1)" : hasMitraName ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(26,122,106,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: hasMitraName && o.status !== "cancelled" ? 18 : 22, fontWeight: 800, color: o.status === "cancelled" ? "#dc2626" : hasMitraName ? "#fff" : "#1a7a6a", flexShrink: 0 }}>
                            {o.status === "cancelled" ? "✕" : hasMitraName ? mitraInitial : svc.emoji}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a" }}>{o.status === "cancelled" ? svc.serviceLabel ?? svc.label : `Mitra: ${o.mitraName ?? "—"}`}</span>
                              {o.status === "cancelled"
                                ? <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>✕ Dibatalkan</span>
                                : <span style={{ fontSize: 10, fontWeight: 700, color: "#1a7a6a", background: "rgba(26,122,106,0.1)", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>✓ Selesai</span>
                              }
                            </div>
                            <div style={{ fontSize: 12, color: "#7a8a9a" }}>{o.vehicleModel} {o.vehicleYear}</div>
                            <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>🕐 {fmtDate(o.createdAt)}</div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                              <div style={{ display: "flex", gap: 1 }}>
                                {o.status === "done" && [1,2,3,4,5].map(s => (
                                  <span key={s} style={{ fontSize: 13, color: s <= (o.rating ?? 0) ? "#f59e0b" : "#e0e8f0" }}>★</span>
                                ))}
                                {o.status === "cancelled" && o.canceledBy && (
                                  <span style={{ fontSize: 11, color: "#dc2626" }}>Dibatalkan oleh {o.canceledBy === "pengguna" ? "Anda" : "mitra"}</span>
                                )}
                              </div>
                              {o.totalAmount ? <span style={{ fontSize: 15, fontWeight: 800, color: "#1a3a5c" }}>{fmtRp(o.totalAmount)}</span> : null}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <span style={{ fontSize: 13, color: "#b0bec5" }}>{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div style={{ borderTop: "1px solid #f0f4f8" }}>

                          {/* DETAIL PESANAN */}
                          <div style={{ padding: "14px 16px 10px" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, marginBottom: 12 }}>DETAIL PESANAN</div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, color: "#7a8a9a" }}>No. Order</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{o.orderNo}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, color: "#7a8a9a" }}>Layanan</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{svc.serviceLabel ?? svc.label}</span>
                            </div>
                            {o.pickupAddress && (
                              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 10 }}>
                                <span style={{ fontSize: 13, flexShrink: 0 }}>📍</span>
                                <span style={{ fontSize: 13, color: "#1a3a5c", lineHeight: 1.4 }}>{o.pickupAddress}</span>
                              </div>
                            )}
                            {keluhan !== "-" && (
                              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", marginBottom: 2 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>📋 Catatan</div>
                                <div style={{ fontSize: 13, color: "#1a2a3a" }}>{keluhan}</div>
                              </div>
                            )}
                          </div>

                          {/* RINCIAN BIAYA */}
                          {pd && (
                            <div style={{ margin: "0 16px 14px", border: "1.5px solid #e0e8f0", borderRadius: 14, overflow: "hidden" }}>
                              {[
                                { label: "Biaya Jasa", sub: "Disepakati langsung dengan mitra", val: pd.biayaJasa },
                                ...(pd.biayaSparepart > 0 ? [{ label: "Sparepart", sub: "Suku cadang yang diganti", val: pd.biayaSparepart }] : []),
                                { label: "Biaya Panggilan", sub: "Ongkos kedatangan mitra", val: pd.biayaPanggilan },
                                { label: "Biaya Layanan & Admin", sub: "Biaya platform Ride", val: pd.biayaLayanan },
                              ].map(row => (
                                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f0f4f8" }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{row.label}</div>
                                    <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 1 }}>{row.sub}</div>
                                  </div>
                                  <span style={{ fontSize: 13, color: "#4a5a6a", fontWeight: 600 }}>{fmtRp(row.val)}</span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f0faf7" }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a" }}>Total Bayar</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: "#1a7a6a" }}>{fmtRp(pd.total)}</span>
                              </div>
                            </div>
                          )}

                          {/* ALASAN PEMBATALAN */}
                          {o.status === "cancelled" && o.cancelReason && (
                            <div style={{ margin: "0 16px 14px", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 14, padding: "12px 14px" }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", marginBottom: 4 }}>⚠️ Alasan Pembatalan</div>
                              <div style={{ fontSize: 13, color: "#7a2020" }}>{o.cancelReason}</div>
                              {o.canceledBy && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>Dibatalkan oleh: {o.canceledBy === "pengguna" ? "Anda" : "mitra"}</div>}
                            </div>
                          )}

                          {/* ULASAN ANDA (sudah ada) */}
                          {o.status === "done" && o.rating != null && (
                            <div style={{ margin: "0 16px 10px", background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <div style={{ display: "flex", gap: 1 }}>
                                  {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: 14, color: s <= o.rating! ? "#f59e0b" : "#e0e8f0" }}>★</span>)}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>Ulasan Anda untuk Mitra</span>
                              </div>
                              <div style={{ fontSize: 12, color: "#4a5a6a" }}>Rating: {o.rating}/5</div>
                              {o.reviewComment && <div style={{ fontSize: 12, color: "#4a5a6a", fontStyle: "italic" as const, marginTop: 4 }}>"{o.reviewComment}"</div>}
                            </div>
                          )}

                          {/* TOMBOL AKSI */}
                          <div style={{ padding: "0 16px 16px", display: "flex", gap: 8, flexDirection: "column" }}>
                            {/* Beri Ulasan — untuk order selesai yang belum dirating */}
                            {o.status === "done" && o.rating == null && (
                              <button onClick={() => { setReviewModal({ open: true, orderId: o.id, orderNo: o.orderNo }); setReviewStars(0); setReviewComment(""); }}
                                style={{ width: "100%", padding: "11px", borderRadius: 14, border: "1.5px solid #f59e0b", background: "#fffbeb", color: "#d97706", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                ⭐ Beri Ulasan untuk Mitra
                              </button>
                            )}
                            {/* Laporkan Masalah */}
                            <button onClick={() => { setLaporModal({ open: true, orderId: o.id, orderNo: o.orderNo }); setLaporMessage(""); setLaporType("order"); }}
                              style={{ width: "100%", padding: "11px", borderRadius: 14, border: "1.5px solid #e0e8f0", background: "#f8fafc", color: "#7a8a9a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                              ⚠️ Laporkan Masalah
                            </button>
                          </div>

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
                  );
                })}
              </div>
            )
          )}
        </div>}

        {/* ══ AKUN TAB ══ */}
        {activeTab === "akun" && <div style={{ padding: "16px 10px 12px" }}>
          {/* ── OTP MODAL ── */}
          {otpPending && (
            <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: "28px 20px", width: "100%", maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                <div style={{ fontSize: 22, textAlign: "center" as const, marginBottom: 4 }}>🔐</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a", textAlign: "center" as const, marginBottom: 8 }}>Verifikasi OTP</div>
                <div style={{ fontSize: 13, color: "#7a8a9a", textAlign: "center" as const, marginBottom: 4 }}>
                  Kode dikirim ke <strong>{otpPending.value}</strong>
                </div>
                {otpPending.demoOtp && (
                  <div style={{ background: "#fff9e6", border: "1px solid #f5a623", borderRadius: 10, padding: "8px 12px", marginBottom: 12, textAlign: "center" as const }}>
                    <div style={{ fontSize: 11, color: "#92400e" }}>Mode Demo — kode OTP Anda:</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#d97706", letterSpacing: 6 }}>{otpPending.demoOtp}</div>
                  </div>
                )}
                <input value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000" maxLength={6}
                  style={{ width: "100%", border: "2px solid #e0e8ef", borderRadius: 12, padding: "12px 0", fontSize: 24, fontWeight: 800, textAlign: "center" as const, letterSpacing: 8, boxSizing: "border-box" as const, outline: "none", marginBottom: 8 }} />
                {otpMsg && <div style={{ fontSize: 12, color: "#e74c3c", textAlign: "center" as const, marginBottom: 8 }}>{otpMsg.text}</div>}
                <button disabled={otpLoading || otpInput.length !== 6} onClick={handleVerifyOtp}
                  style={{ width: "100%", background: otpInput.length === 6 ? "#1a7a6a" : "#b2dfdb", color: "#fff", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {otpLoading ? "Memverifikasi..." : "Verifikasi"}
                </button>
                <button onClick={() => { setOtpPending(null); setOtpInput(""); setOtpMsg(null); }}
                  style={{ width: "100%", background: "none", border: "1.5px solid #e0e8ef", borderRadius: 12, padding: "11px 0", fontSize: 14, fontWeight: 600, color: "#7a8a9a", cursor: "pointer" }}>
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* ── HERO PROFIL ── */}
          {(() => {
            const photoUrl = photoPreview ?? (profile?.profilePhotoPath ? profile.profilePhotoPath : null);
            return (
              <div style={{ background: "linear-gradient(135deg, #0d2137 0%, #1a7a6a 100%)", borderRadius: 22, padding: "24px 18px 20px", marginBottom: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.13)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 66, height: 66, borderRadius: 22, overflow: "hidden", border: "2.5px solid rgba(255,255,255,0.35)", flexShrink: 0, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {photoUrl ? <img src={photoUrl} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{(profile?.name ?? user?.name ?? "U").charAt(0).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{profile?.name ?? user?.name ?? "Memuat..."}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{profile?.email ?? ""}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{profile?.phone ?? "—"}</div>
                  </div>
                  <button onClick={() => setOpenAkunSection(openAkunSection === "profil" ? null : "profil")}
                    style={{ background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 12, padding: "7px 13px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    {openAkunSection === "profil" ? "Tutup" : "Edit"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  {[
                    { val: orderHistory.length, label: "Pesanan" },
                    { val: Math.round((orderHistory.reduce((s, o) => s + (o.rating ?? 0), 0) / (orderHistory.filter(o => o.rating).length || 1)) * 10) / 10 || "—", label: "Rating" },
                    { val: profile?.createdAt ? new Date(profile.createdAt).getFullYear() : "—", label: "Bergabung" },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "8px 0", textAlign: "center" as const }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{stat.val}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Edit Profil panel - FULL */}
          {openAkunSection === "profil" && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 14px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", marginBottom: 14 }}>Edit Profil</div>
              {/* Photo */}
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 84, height: 84, borderRadius: 26, overflow: "hidden", background: "#e8f5f2", border: "2.5px solid #1a7a6a", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, cursor: "pointer" }}
                  onClick={() => photoInputRef.current?.click()}>
                  {(photoPreview ?? profile?.profilePhotoPath) ? <img src={photoPreview ?? profile?.profilePhotoPath ?? ""} alt="foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 34, fontWeight: 900, color: "#1a7a6a" }}>{(profile?.name ?? "U").charAt(0).toUpperCase()}</span>}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                  const f = e.target.files?.[0]; if (f) { setPhotoFile(f); const rd = new FileReader(); rd.onload = ev => setPhotoPreview(ev.target?.result as string); rd.readAsDataURL(f); }
                }} />
                <button onClick={() => photoInputRef.current?.click()}
                  style={{ background: "none", border: "1.5px solid #1a7a6a", borderRadius: 10, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: "#1a7a6a", cursor: "pointer", marginBottom: photoFile ? 6 : 0 }}>
                  Ganti Foto
                </button>
                {photoFile && <button disabled={photoUploading} onClick={handlePhotoUpload}
                  style={{ background: "#1a7a6a", border: "none", borderRadius: 10, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {photoUploading ? "Mengupload..." : "Upload Foto"}
                </button>}
              </div>
              {/* Nama */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8a9a", marginBottom: 4 }}>NAMA LENGKAP</div>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 10, outline: "none" }}
                placeholder="Nama lengkap" />
              {/* HP */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8a9a", marginBottom: 4 }}>NOMOR HP</div>
              <div style={{ position: "relative" as const, marginBottom: 10 }}>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value.replace(/\D/g, ""))}
                  style={{ width: "100%", border: `1.5px solid ${editPhone !== (profile?.phone ?? "") ? "#f5a623" : "#e0e8ef"}`, borderRadius: 10, padding: "10px 12px", paddingRight: editPhone !== (profile?.phone ?? "") ? 90 : 12, fontSize: 14, boxSizing: "border-box" as const, outline: "none" }}
                  placeholder="08xxxxxxxxxx" />
                {editPhone !== (profile?.phone ?? "") && <span style={{ position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 800, background: "#fff9e6", color: "#d97706", padding: "2px 6px", borderRadius: 6 }}>OTP diperlukan</span>}
              </div>
              {/* Email */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8a9a", marginBottom: 4 }}>EMAIL</div>
              <div style={{ position: "relative" as const, marginBottom: 14 }}>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${editEmail !== (profile?.email ?? "") ? "#f5a623" : "#e0e8ef"}`, borderRadius: 10, padding: "10px 12px", paddingRight: editEmail !== (profile?.email ?? "") ? 90 : 12, fontSize: 14, boxSizing: "border-box" as const, outline: "none" }}
                  placeholder="email@contoh.com" />
                {editEmail !== (profile?.email ?? "") && <span style={{ position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 800, background: "#fff9e6", color: "#d97706", padding: "2px 6px", borderRadius: 6 }}>OTP diperlukan</span>}
              </div>
              {/* Info: bergabung + level */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "#f7f9fc", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#9aa5b4" }}>Bergabung</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                </div>
                <div style={{ flex: 1, background: getLevel(orderHistory.length).bg, borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#9aa5b4" }}>Level</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: getLevel(orderHistory.length).color }}>{getLevel(orderHistory.length).label}</div>
                </div>
              </div>
              {profileSaveMsg && <div style={{ fontSize: 12, color: profileSaveMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{profileSaveMsg.text}</div>}
              <button disabled={profileSaveLoading} onClick={handleProfileSave}
                style={{ width: "100%", background: profileSaveLoading ? "#b2dfdb" : "#1a7a6a", color: "#fff", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {profileSaveLoading ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          )}

          {/* Menu grup 1: Aktivitas & Ulasan */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Aktivitas & Ulasan</div>
            {[
              { id: "pesanan-menu", icon: "📋", label: "Riwayat Pesanan", sub: `${orderHistory.length} pesanan selesai`, action: () => { setActiveTab("pesanan"); setPesananSubTab("riwayat"); } },
              { id: "chat-menu", icon: "💬", label: "Riwayat Chat", sub: `${orderHistory.length} percakapan`, action: () => { setActiveTab("chat"); setChatSubTab("riwayat"); } },
            ].map(item => (
              <div key={item.id}>
                <button onClick={() => item.action()}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#b0bec5" }}>›</span>
                </button>
              </div>
            ))}
            {/* Ulasan Terakhir */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "ulasan" ? null : "ulasan")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>⭐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Ulasan & Rating Saya</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>
                    {orderHistory.filter(o => o.rating).length > 0
                      ? `${orderHistory.filter(o => o.rating).length} ulasan diberikan · rata-rata ${(Math.round((orderHistory.reduce((s, o) => s + (o.rating ?? 0), 0) / (orderHistory.filter(o => o.rating).length || 1)) * 10) / 10).toFixed(1)} ⭐`
                      : "Belum ada ulasan diberikan"}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "ulasan" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "ulasan" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {/* Stats row */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, background: "#f0faf8", borderRadius: 10, padding: "10px 0", textAlign: "center" as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#1a7a6a" }}>{orderHistory.length}</div>
                      <div style={{ fontSize: 10, color: "#5a7a6a", marginTop: 2 }}>Total Order</div>
                    </div>
                    <div style={{ flex: 1, background: "#fff9e6", borderRadius: 10, padding: "10px 0", textAlign: "center" as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#c8960c" }}>
                        {orderHistory.filter(o => o.rating).length > 0
                          ? (Math.round((orderHistory.reduce((s, o) => s + (o.rating ?? 0), 0) / (orderHistory.filter(o => o.rating).length || 1)) * 10) / 10).toFixed(1)
                          : "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "#9a7a2c", marginTop: 2 }}>Rating Rata-rata</div>
                    </div>
                    <div style={{ flex: 1, background: "#f0f4f8", borderRadius: 10, padding: "10px 0", textAlign: "center" as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#1a3a5c" }}>{orderHistory.filter(o => o.rating).length}</div>
                      <div style={{ fontSize: 10, color: "#5a6a7a", marginTop: 2 }}>Ulasan Ditulis</div>
                    </div>
                  </div>
                  {/* Last reviews */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1a2a3a", marginBottom: 8 }}>Ulasan Terakhir</div>
                  {orderHistory.filter(o => o.rating).length === 0 && (
                    <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center" as const, padding: "12px 0" }}>Belum ada ulasan yang diberikan.</div>
                  )}
                  {orderHistory.filter(o => o.rating).slice(0, 3).map(o => {
                    const svc = getSvc(o.serviceType);
                    return (
                      <div key={o.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{svc.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{svc.label}</div>
                            <div style={{ fontSize: 10, color: "#9aa5b4" }}>{fmtDate(o.createdAt)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 1 }}>
                            {[1, 2, 3, 4, 5].map(s => (
                              <span key={s} style={{ fontSize: 12, color: s <= (o.rating ?? 0) ? "#f5a623" : "#d0d9e2" }}>★</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "#5a6a7a" }}>{o.vehicleModel}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Menu grup 3: Voucher & Promo */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Voucher & Promo</div>
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "voucher" ? null : "voucher")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🎟️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Voucher Aktif Saya</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{activeVouchersLoaded ? `${activeVouchers.length} voucher tersedia` : "Lihat voucher aktif"}</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "voucher" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "voucher" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {!activeVouchersLoaded && <button onClick={fetchActiveVouchers} style={{ width: "100%", marginTop: 8, padding: "8px", borderRadius: 10, border: "1.5px solid #e0e8ef", background: "#f8fafc", color: "#1a3a5c", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Muat Voucher Aktif</button>}
                  {activeVouchersLoaded && activeVouchers.length === 0 && <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 8 }}>Tidak ada voucher aktif saat ini.</div>}
                  {activeVouchers.map(v => {
                    const discLabel = v.discountType === "percent" ? `Diskon ${v.discountValue}%${v.maxDiscount ? ` (maks. Rp ${v.maxDiscount.toLocaleString("id-ID")})` : ""}` : `Diskon Rp ${v.discountValue.toLocaleString("id-ID")}`;
                    const expLabel = v.expiresAt ? `s/d ${new Date(v.expiresAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}` : "Tidak ada batas waktu";
                    return (
                      <div key={v.id} style={{ background: "#f0faf8", borderRadius: 12, padding: "10px 12px", marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a7a6a" }}>{v.code}</div>
                          <div style={{ fontSize: 11, color: "#5a7a6a", marginTop: 2 }}>{v.description ?? discLabel}</div>
                          <div style={{ fontSize: 10, color: "#9aa5b4", marginTop: 2 }}>{expLabel}{v.minOrder > 0 ? ` · Min. Rp ${v.minOrder.toLocaleString("id-ID")}` : ""}</div>
                        </div>
                        <button onClick={() => { setVoucherInput(v.code); }} style={{ background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Pakai</button>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input value={voucherInput} onChange={e => { setVoucherInput(e.target.value.toUpperCase()); setVoucherMsg(null); }} placeholder="Punya kode voucher?"
                      style={{ flex: 1, border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                    <button onClick={async () => { if (!voucherInput.trim()) return; try { const r = await fetch(`/api/pengguna/vouchers/check?code=${encodeURIComponent(voucherInput)}&total=0`, { credentials: "include" }); const d = await r.json(); if (d.valid) { setVoucherMsg({ type: "ok", text: `✅ Kode "${voucherInput}" valid! ${d.description || ""}` }); } else { setVoucherMsg({ type: "err", text: d.error ?? "Kode tidak valid." }); } } catch { setVoucherMsg({ type: "err", text: "Gagal memverifikasi kode voucher." }); } }}
                      style={{ background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cek</button>
                  </div>
                  {voucherMsg && <div style={{ fontSize: 11, color: voucherMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginTop: 6 }}>{voucherMsg.text}</div>}
                  {/* Riwayat Penggunaan Voucher */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1a2a3a", marginTop: 14, marginBottom: 6 }}>Riwayat Penggunaan Voucher</div>
                  {voucherHistory.length === 0 && <div style={{ fontSize: 12, color: "#9aa5b4" }}>Belum ada riwayat voucher.</div>}
                  {voucherHistory.map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #f0f4f8" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f0faf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎟️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1a7a6a" }}>{v.code}</div>
                        <div style={{ fontSize: 10, color: "#5a7a6a" }}>{v.desc} · {v.order}</div>
                      </div>
                      <div style={{ fontSize: 10, color: "#9aa5b4" }}>{v.usedAt}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Referral Code */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "referral" ? null : "referral")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🔗</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Kode Referral Saya</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Ajak teman, dapatkan bonus</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "referral" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "referral" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  <div style={{ background: "linear-gradient(135deg, #e8f5f2 0%, #f0f9f6 100%)", borderRadius: 12, padding: "14px 14px", marginTop: 8, textAlign: "center" as const }}>
                    <div style={{ fontSize: 11, color: "#5a7a6a", marginBottom: 6 }}>Kode Referral Anda</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#1a7a6a", letterSpacing: 4, marginBottom: 8 }}>RIDE{profile?.id ?? "****"}</div>
                    <button onClick={() => { navigator.clipboard?.writeText(`RIDE${profile?.id ?? ""}`); alert("Kode referral disalin!"); }}
                      style={{ background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 10, padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      📋 Salin Kode
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8a9a", marginTop: 10, lineHeight: 1.5 }}>
                    Bagikan kode referral Anda ke teman. Setiap teman yang mendaftar dan menyelesaikan order pertama, Anda mendapat reward eksklusif dari RIDE.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Menu grup 2: Preferensi */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Preferensi</div>
            {[
              { id: "alamat", icon: "📍", label: "Alamat Tersimpan", sub: `${alamatList.length} alamat` },
              { id: "notifikasi", icon: "🔔", label: "Notifikasi", sub: "Kelola pemberitahuan" },
            ].map(item => (
              <div key={item.id}>
                <button onClick={() => setOpenAkunSection(openAkunSection === item.id ? null : item.id)}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === item.id ? "∨" : "›"}</span>
                </button>
                {openAkunSection === "alamat" && item.id === "alamat" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                    {alamatList.length === 0 && <div style={{ fontSize: 12, color: "#9aa5b4", padding: "8px 0" }}>Belum ada alamat tersimpan.</div>}
                    {alamatList.map(a => (
                      <div key={a.id} style={{ background: a.id === defaultAlamatId ? "#f0faf8" : "#f8fafc", borderRadius: 10, padding: "9px 12px", marginTop: 8, border: a.id === defaultAlamatId ? "1.5px solid #1a7a6a" : "1.5px solid transparent" }}>
                        {editingAlamatId === a.id ? (
                          /* Mode Edit */
                          <div>
                            <input value={editAlamatLabel} onChange={e => setEditAlamatLabel(e.target.value)} placeholder="Label (misal: Rumah)"
                              style={{ width: "100%", border: "1.5px solid #1a7a6a", borderRadius: 8, padding: "6px 10px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 6, outline: "none" }} />
                            <input value={editAlamatAddr} onChange={e => setEditAlamatAddr(e.target.value)} placeholder="Alamat lengkap"
                              style={{ width: "100%", border: "1.5px solid #1a7a6a", borderRadius: 8, padding: "6px 10px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 8, outline: "none" }} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => {
                                if (!editAlamatLabel.trim() || !editAlamatAddr.trim()) return;
                                setAlamatList(l => l.map(x => x.id === a.id ? { ...x, label: editAlamatLabel.trim(), address: editAlamatAddr.trim() } : x));
                                setEditingAlamatId(null);
                              }} style={{ flex: 1, background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Simpan</button>
                              <button onClick={() => setEditingAlamatId(null)}
                                style={{ flex: 1, background: "#f0f4f8", color: "#7a8a9a", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 12, cursor: "pointer" }}>Batal</button>
                            </div>
                          </div>
                        ) : (
                          /* Mode View */
                          <>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{a.label}</div>
                                  {a.id === defaultAlamatId && <span style={{ background: "#1a7a6a", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 5, padding: "1px 6px" }}>DEFAULT</span>}
                                </div>
                                <div style={{ fontSize: 11, color: "#7a8a9a", marginTop: 2 }}>{a.address}</div>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                <button onClick={() => { setEditingAlamatId(a.id); setEditAlamatLabel(a.label); setEditAlamatAddr(a.address); }}
                                  style={{ background: "none", border: "none", color: "#1a7a6a", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 700 }}>✏️</button>
                                <button onClick={() => { setAlamatList(l => l.filter(x => x.id !== a.id)); if (defaultAlamatId === a.id) setDefaultAlamatId(null); }}
                                  style={{ background: "none", border: "none", color: "#e74c3c", fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
                              </div>
                            </div>
                            {a.id !== defaultAlamatId && (
                              <button onClick={() => setDefaultAlamatId(a.id)}
                                style={{ marginTop: 6, background: "none", border: "1px solid #1a7a6a", borderRadius: 7, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#1a7a6a", cursor: "pointer" }}>
                                Jadikan Default
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ marginTop: 10 }}>
                      <input value={newAlamatLabel} onChange={e => setNewAlamatLabel(e.target.value)} placeholder="Label (misal: Rumah)"
                        style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 6, outline: "none" }} />
                      <input value={newAlamatAddr} onChange={e => setNewAlamatAddr(e.target.value)} placeholder="Alamat lengkap"
                        style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 8, outline: "none" }} />
                      <button onClick={() => { if (!newAlamatLabel.trim() || !newAlamatAddr.trim()) return; setAlamatList(l => [...l, { id: Date.now().toString(), label: newAlamatLabel.trim(), address: newAlamatAddr.trim() }]); setNewAlamatLabel(""); setNewAlamatAddr(""); }}
                        style={{ width: "100%", background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 10, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        + Tambah Alamat
                      </button>
                    </div>
                  </div>
                )}
                {openAkunSection === "notifikasi" && item.id === "notifikasi" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                    {([
                      { key: "pesanan", label: "Update Status Pesanan", desc: "Notifikasi saat mitra menerima atau menyelesaikan order" },
                      { key: "chat", label: "Pesan Chat", desc: "Notifikasi saat mitra mengirim pesan" },
                      { key: "promo", label: "Promo & Voucher", desc: "Informasi diskon dan promo terbaru" },
                      { key: "pengingat", label: "Pengingat Layanan", desc: "Pengingat jadwal servis berkala" },
                    ] as const).map(n => (
                      <div key={n.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #f0f4f8" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{n.label}</div>
                          <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 2 }}>{n.desc}</div>
                        </div>
                        <div onClick={() => setNotifSettings((s: any) => ({ ...s, [n.key]: !s[n.key] }))}
                          style={{ width: 42, height: 24, borderRadius: 12, background: notifSettings[n.key] ? "#1a7a6a" : "#d0d9e2", cursor: "pointer", position: "relative" as const, transition: "background 0.2s", flexShrink: 0 }}>
                          <div style={{ position: "absolute" as const, top: 3, left: notifSettings[n.key] ? 20 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Menu grup 3: Keamanan */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Keamanan Akun</div>
            {/* Ganti Password */}
            <div>
              <button onClick={() => setKeamananSubSection(keamananSubSection === "password" ? null : "password")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Ganti Password</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Ubah kata sandi akun</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{keamananSubSection === "password" ? "∨" : "›"}</span>
              </button>
              {keamananSubSection === "password" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {(["cpOld", "cpNew", "cpConfirm"] as const).map((k, i) => (
                    <input key={k} type="password"
                      value={k === "cpOld" ? cpOld : k === "cpNew" ? cpNew : cpConfirm}
                      onChange={e => { if (k === "cpOld") setCpOld(e.target.value); else if (k === "cpNew") setCpNew(e.target.value); else setCpConfirm(e.target.value); }}
                      placeholder={["Password lama", "Password baru (min. 8 karakter)", "Konfirmasi password baru"][i]}
                      style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 8, outline: "none" }} />
                  ))}
                  {cpMsg && <div style={{ fontSize: 12, color: cpMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{cpMsg.text}</div>}
                  <button disabled={cpLoading} onClick={async () => {
                    setCpMsg(null);
                    if (!cpOld || !cpNew || !cpConfirm) { setCpMsg({ type: "err", text: "Semua field wajib diisi" }); return; }
                    if (cpNew !== cpConfirm) { setCpMsg({ type: "err", text: "Konfirmasi password tidak cocok" }); return; }
                    if (cpNew.length < 8) { setCpMsg({ type: "err", text: "Password baru minimal 8 karakter" }); return; }
                    setCpLoading(true);
                    const r = await fetch("/api/pengguna/change-password", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cpOld, newPassword: cpNew }) });
                    const d = await r.json();
                    setCpLoading(false);
                    if (d.ok) { setCpMsg({ type: "ok", text: "Password berhasil diubah!" }); setCpOld(""); setCpNew(""); setCpConfirm(""); }
                    else setCpMsg({ type: "err", text: d.error ?? "Gagal mengubah password" });
                  }} style={{ width: "100%", background: cpLoading ? "#b2dfdb" : "#1a3a5c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {cpLoading ? "Menyimpan..." : "Ubah Password"}
                  </button>
                </div>
              )}
            </div>
            {/* Ubah Nomor HP */}
            <div>
              <button onClick={() => setKeamananSubSection(keamananSubSection === "ubah-hp" ? null : "ubah-hp")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Ubah Nomor HP</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Verifikasi OTP diperlukan</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{keamananSubSection === "ubah-hp" ? "∨" : "›"}</span>
              </button>
              {keamananSubSection === "ubah-hp" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  <div style={{ fontSize: 12, color: "#7a8a9a", marginBottom: 10 }}>
                    Nomor HP saat ini: <strong>{profile?.phone ?? "—"}</strong>
                  </div>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Nomor HP baru (08xxxxxxxxxx)"
                    style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 10, outline: "none" }} />
                  {profileSaveMsg && profileSaveMsg.text.includes("HP") && <div style={{ fontSize: 12, color: profileSaveMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{profileSaveMsg.text}</div>}
                  <button disabled={!editPhone.trim() || editPhone.trim() === (profile?.phone ?? "")} onClick={async () => {
                    setProfileSaveMsg(null);
                    const r = await fetch("/api/pengguna/request-profile-otp", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "phone", value: editPhone.trim() }) });
                    const d = await r.json();
                    if (!d.ok) { setProfileSaveMsg({ type: "err", text: d.error ?? "Gagal kirim OTP" }); return; }
                    setOtpPending({ field: "phone", value: editPhone.trim(), demoOtp: d.otpDemo });
                    setOtpInput(""); setOtpMsg(null);
                  }} style={{ width: "100%", background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Kirim Kode OTP
                  </button>
                </div>
              )}
            </div>
            {/* Riwayat Login */}
            <div>
              <button onClick={() => setKeamananSubSection(keamananSubSection === "riwayat-login" ? null : "riwayat-login")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🖥️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Riwayat Login</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Perangkat & waktu masuk terakhir</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{keamananSubSection === "riwayat-login" ? "∨" : "›"}</span>
              </button>
              {keamananSubSection === "riwayat-login" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {loginHistory.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? "1px solid #f0f4f8" : "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: item.current ? "#e8f5f2" : "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {item.device.includes("Android") || item.device.includes("iPhone") ? "📱" : "💻"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{item.device}</div>
                          {item.current && <span style={{ background: "#1a7a6a", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 5, padding: "1px 6px" }}>SAAT INI</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 2 }}>{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Keluar dari Semua Perangkat */}
            <div>
              <button onClick={() => {
                if (window.confirm("Yakin ingin keluar dari semua perangkat? Anda akan perlu login ulang.")) {
                  fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => navigate("/login"));
                }
              }} style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🚫</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e74c3c" }}>Keluar dari Semua Perangkat</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Akhiri semua sesi aktif</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>›</span>
              </button>
            </div>
          </div>

          {/* Menu grup 4: Bantuan & Dukungan */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Bantuan & Dukungan</div>
            {/* FAQ */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "bantuan" ? null : "bantuan")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>❓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>FAQ</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Pertanyaan yang sering ditanyakan</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "bantuan" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "bantuan" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {[
                    { q: "Bagaimana cara memesan layanan?", a: "Pilih layanan di tab Beranda, isi form detail kendaraan dan lokasi, lalu tunggu mitra terdekat menerima pesanan Anda." },
                    { q: "Berapa lama mitra sampai?", a: "Estimasi kedatangan mitra adalah 15–45 menit tergantung jarak dan ketersediaan mitra di area Anda." },
                    { q: "Bagaimana cara membatalkan pesanan?", a: "Pembatalan hanya dapat dilakukan selama sistem masih mencari mitra (sebelum mitra menerima pesanan). Setelah mitra menerima dan sedang dalam perjalanan, pesanan tidak dapat dibatalkan." },
                    { q: "Bagaimana jika ada masalah dengan layanan?", a: "Hubungi kami via WhatsApp atau chat CS RIDE untuk penanganan dalam 1x24 jam." },
                  ].map((faq, i) => (
                    <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid #f0f4f8" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a3a5c", marginBottom: 4 }}>Q: {faq.q}</div>
                      <div style={{ fontSize: 12, color: "#5a6a7a", lineHeight: 1.5 }}>{faq.a}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Chat CS RIDE */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "chat-cs" ? null : "chat-cs")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🎧</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Chat Customer Service RIDE</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Hubungi CS kami langsung via email</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "chat-cs" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "chat-cs" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  <div style={{ background: "#f0faf8", borderRadius: 12, padding: "12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a7a6a", marginBottom: 4 }}>🟢 CS Online · Waktu respons ~5 menit</div>
                    <div style={{ fontSize: 11, color: "#5a7a6a" }}>Tim CS RIDE siap membantu Anda pada hari kerja pukul 08.00–22.00 WIB.</div>
                  </div>
                  <a href="mailto:support@ride.app"
                    style={{ display: "block", background: "#1a3a5c", color: "#fff", textDecoration: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, textAlign: "center" as const }}>
                    ✉️ Kirim Email ke CS
                  </a>
                </div>
              )}
            </div>
            {/* Hubungi via WhatsApp */}
            <div>
              <a href="https://wa.me/6280081433277" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>📲</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Hubungi via WhatsApp</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Chat langsung di WhatsApp RIDE</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#25D366", fontWeight: 800 }}>›</span>
                </div>
              </a>
            </div>
            {/* Laporkan Masalah */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "laporan" ? null : "laporan")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Laporkan Masalah</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Laporkan order atau masalah lainnya</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "laporan" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "laporan" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  <select value={reportType} onChange={e => setReportType(e.target.value)}
                    style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 10px", fontSize: 13, marginBottom: 8, outline: "none", background: "#fff" }}>
                    <option value="order">Masalah order / layanan</option>
                    <option value="mitra">Keluhan terhadap mitra</option>
                    <option value="pembayaran">Masalah pembayaran / saldo</option>
                    <option value="lainnya">Masalah lainnya</option>
                  </select>
                  <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder="Judul singkat laporan Anda..."
                    style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 8, outline: "none" }} />
                  <textarea value={reportInput} onChange={e => setReportInput(e.target.value)} placeholder="Ceritakan masalah Anda secara detail..."
                    style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" as const, resize: "none", height: 80, marginBottom: 10, outline: "none" }} />
                  {reportMsg && <div style={{ fontSize: 12, color: reportMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{reportMsg.text}</div>}
                  <button disabled={reportLoading || !reportInput.trim() || !reportTitle.trim()} onClick={async () => {
                    setReportLoading(true); setReportMsg(null);
                    try {
                      const r = await fetch("/api/pengguna/reports", {
                        method: "POST", credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: reportType, title: reportTitle.trim(), message: reportInput.trim() }),
                      });
                      const d = await r.json();
                      if (d.ok) {
                        setReportMsg({ type: "ok", text: "Laporan berhasil dikirim! Tim kami akan menindaklanjuti dalam 1x24 jam." });
                        setReportInput(""); setReportTitle("");
                        if (d.report) setReportList(prev => [d.report, ...prev]);
                      } else {
                        setReportMsg({ type: "err", text: d.error ?? "Gagal mengirim laporan" });
                      }
                    } catch { setReportMsg({ type: "err", text: "Gagal terhubung ke server" }); }
                    setReportLoading(false);
                  }} style={{ width: "100%", background: reportLoading ? "#b2dfdb" : "#e74c3c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {reportLoading ? "Mengirim..." : "Kirim Laporan"}
                  </button>
                </div>
              )}
            </div>
            {/* Status Tiket Laporan */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "tiket" ? null : "tiket")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>📌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Status Tiket Laporan Saya</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{reportList.length} tiket aktif</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "tiket" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "tiket" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {reportList.length === 0 && <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center" as const, padding: "12px 0" }}>Belum ada tiket laporan.</div>}
                  {reportList.map(t => {
                    const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                      open: { bg: "#fff9e6", color: "#c8960c", label: "Menunggu" },
                      in_progress: { bg: "#e8f4ff", color: "#1a3a5c", label: "Diproses" },
                      resolved: { bg: "#e8f8f0", color: "#1a7a6a", label: "Selesai" },
                    };
                    const sc = statusColors[t.status] ?? statusColors.open;
                    return (
                      <div key={t.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 12px", marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#1a3a5c" }}>#{String(t.id).padStart(4, "0")}</div>
                          <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 7px" }}>{sc.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#1a2a3a", fontWeight: 600 }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: "#9aa5b4", marginTop: 4 }}>Dibuat: {new Date(t.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Menu grup 5: Tentang Aplikasi */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Tentang Aplikasi</div>
            {[
              { id: "tentang", icon: "ℹ️", label: "Tentang RIDE", sub: "Versi 1.0.0" },
              { id: "syarat", icon: "📜", label: "Syarat & Ketentuan", sub: "Kebijakan penggunaan layanan" },
              { id: "privasi", icon: "🛡️", label: "Kebijakan Privasi", sub: "Data dan keamanan informasi Anda" },
            ].map(item => (
              <div key={item.id}>
                <button onClick={() => setOpenAkunSection(openAkunSection === item.id ? null : item.id)}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === item.id ? "∨" : "›"}</span>
                </button>
                {openAkunSection === "tentang" && item.id === "tentang" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                    <div style={{ textAlign: "center" as const, padding: "12px 0" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#1a3a5c", letterSpacing: -1 }}>RIDE</div>
                      <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 4 }}>Super App Jasa Panggilan</div>
                      <div style={{ fontSize: 11, color: "#b0bec5", marginTop: 2 }}>Versi 1.0.0 · Build 2026</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#7a8a9a", lineHeight: 1.6, marginTop: 6 }}>RIDE menghubungkan pengguna dengan mitra jasa profesional di bidang bengkel, elektronik, cuci kendaraan, barber, inspeksi, dan towing. Layanan panggilan ke lokasi Anda, cepat dan terpercaya.</div>
                  </div>
                )}
                {openAkunSection === "syarat" && item.id === "syarat" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8", fontSize: 12, color: "#7a8a9a", lineHeight: 1.6 }}>
                    Dengan menggunakan layanan RIDE, Anda setuju dengan syarat dan ketentuan yang berlaku. RIDE berhak menangguhkan akun yang melanggar ketentuan layanan. Seluruh transaksi bersifat final setelah layanan selesai diberikan oleh mitra.
                  </div>
                )}
                {openAkunSection === "privasi" && item.id === "privasi" && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8", fontSize: 12, color: "#7a8a9a", lineHeight: 1.6 }}>
                    Data pribadi Anda disimpan dengan enkripsi dan tidak dibagikan kepada pihak ketiga tanpa izin. Kami menggunakan data lokasi hanya selama sesi layanan aktif. Untuk penghapusan data, hubungi privacy@ride.app.
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tombol Keluar */}
          <button onClick={() => fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => navigate("/login"))}
            style={{ width: "100%", background: "#fff0f0", borderRadius: 16, padding: "14px 16px", border: "1.5px solid #fde8e8", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(231,76,60,0.07)" }}>
            <span style={{ fontSize: 22 }}>🚪</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e74c3c" }}>Keluar dari Akun</span>
          </button>

          <div style={{ height: 8 }} />
        </div>}

      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8ecf0", display: "flex", zIndex: 1000 }}>
        {([
          { id: "beranda" as TabId, icon: "🏠", label: "Beranda", badge: 0 },
          { id: "pesanan" as TabId, icon: "📋", label: "Pesanan", badge: activeOrder ? 1 : 0 },
          { id: "chat" as TabId, icon: "💬", label: "Chat", badge: unreadChat > 0 ? unreadChat : (activeOrder ? 1 : 0) },
          { id: "akun" as TabId, icon: "👤", label: "Akun", badge: 0 },
        ]).map(item => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => { setActiveTab(item.id); if (item.id === "chat") setUnreadChat(0); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 6px", background: "none", border: "none", cursor: "pointer", position: "relative" }}>
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
