import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { socket, identifySocket, joinOrderRoom, leaveOrderRoom } from "../lib/socket";

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
  createdAt: string; rating?: number | null;
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
  // Wallet
  type WalletTx = { id: number; type: string; amount: number; description: string; createdAt: string };
  const [walletData, setWalletData] = useState<{ balance: number; transactions: WalletTx[] } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState("GoPay");
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupMsg, setTopupMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Payment methods (localStorage)
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; type: string; label: string; icon: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("ride-paymethods") ?? "null") ?? [
      { id: "1", type: "ewallet", label: "GoPay", icon: "🟢" },
      { id: "2", type: "ewallet", label: "OVO", icon: "🟣" },
    ]; } catch { return []; }
  });
  const [addingPayMethod, setAddingPayMethod] = useState(false);
  const [newPayType, setNewPayType] = useState("ewallet");
  const [newPayLabel, setNewPayLabel] = useState("");
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

  // Voucher usage history
  const voucherHistory = [
    { code: "RIDE5", desc: "Diskon 5%", usedAt: "12 Apr 2026", order: "#RD-20260412" },
    { code: "GRATIS", desc: "Gratis biaya panggilan", usedAt: "05 Apr 2026", order: "#RD-20260405" },
  ];

  // Report / ticket
  const [reportInput, setReportInput] = useState("");
  const [reportType, setReportType] = useState("order");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMsg, setReportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [reportList] = useState([
    { id: "TKT-001", title: "Order tidak selesai dengan benar", status: "Sedang diproses", date: "15 Apr 2026" },
  ]);

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
      // Refresh full order data
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json()).then(d => { if (d.order) setActiveOrder(d.order); }).catch(() => {});
    };
    const onPhase = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, trackingPhase: data.phase } : prev);
    };
    const onPayment = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, paymentData: data.paymentData } : prev);
    };
    const onDone = (data: any) => {
      setActiveOrder(prev => prev && prev.id === data.orderId ? { ...prev, status: "done" } : prev);
      // Refresh full order + history
      fetch("/api/pengguna/active-order", { credentials: "include" })
        .then(r => r.json()).then(d => setActiveOrder(d.order ?? null)).catch(() => {});
      fetch("/api/pengguna/order-history", { credentials: "include" })
        .then(r => r.json()).then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); }).catch(() => {});
    };
    socket.on("order:accepted", onAccepted);
    socket.on("order:phase", onPhase);
    socket.on("order:payment", onPayment);
    socket.on("order:done", onDone);
    return () => {
      socket.off("order:accepted", onAccepted);
      socket.off("order:phase", onPhase);
      socket.off("order:payment", onPayment);
      socket.off("order:done", onDone);
    };
  }, []);

  // Fetch order history
  useEffect(() => {
    fetch("/api/pengguna/order-history", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.orders)) setOrderHistory(d.orders); })
      .catch(() => {});
  }, []);

  // Fetch profil pengguna (untuk tab Akun)
  useEffect(() => {
    fetch("/api/pengguna/profile", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.id) { setProfile(d); setEditName(d.name); setEditPhone(d.phone ?? ""); setEditEmail(d.email ?? ""); } })
      .catch(() => {});
  }, []);

  // Fetch wallet saldo
  const fetchWallet = () => {
    setWalletLoading(true);
    fetch("/api/pengguna/wallet", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.balance !== undefined) setWalletData(d); })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  };
  useEffect(() => {
    fetchWallet();
  }, []);

  // Sync notif settings to localStorage
  useEffect(() => {
    localStorage.setItem("ride-notif-p", JSON.stringify(notifSettings));
  }, [notifSettings]);

  // Sync alamat to localStorage
  useEffect(() => {
    localStorage.setItem("ride-alamat", JSON.stringify(alamatList));
  }, [alamatList]);

  // Sync payment methods to localStorage
  useEffect(() => {
    localStorage.setItem("ride-paymethods", JSON.stringify(paymentMethods));
  }, [paymentMethods]);

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
    };
    socket.on("chat:message", onChat);

    return () => {
      leaveOrderRoom(orderId);
      socket.off("chat:message", onChat);
    };
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

          {/* ── TOP-UP MODAL ── */}
          {topupModal && (
            <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "28px 20px 36px", width: "100%", maxWidth: 480, boxShadow: "0 -8px 32px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", marginBottom: 16 }}>💳 Isi Saldo RIDE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {["50000", "100000", "200000", "500000", "1000000", "2000000"].map(amt => (
                    <button key={amt} onClick={() => setTopupAmount(amt)}
                      style={{ background: topupAmount === amt ? "#1a7a6a" : "#f0f4f8", color: topupAmount === amt ? "#fff" : "#1a2a3a", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {fmtRp(+amt)}
                    </button>
                  ))}
                </div>
                <input value={topupAmount} onChange={e => setTopupAmount(e.target.value.replace(/\D/g, ""))} placeholder="Atau masukkan nominal lain"
                  style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 12, outline: "none" }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8a9a", marginBottom: 8 }}>Metode Pembayaran</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
                  {["GoPay", "OVO", "DANA", "ShopeePay", "BCA Virtual Account", "Kartu Kredit"].map(m => (
                    <button key={m} onClick={() => setTopupMethod(m)}
                      style={{ padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${topupMethod === m ? "#1a7a6a" : "#e0e8ef"}`, background: topupMethod === m ? "#e8f5f2" : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: topupMethod === m ? "#1a7a6a" : "#7a8a9a" }}>
                      {m}
                    </button>
                  ))}
                </div>
                {topupMsg && <div style={{ fontSize: 12, color: topupMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{topupMsg.text}</div>}
                <button disabled={topupLoading || !topupAmount || +topupAmount < 10000} onClick={async () => {
                  setTopupLoading(true); setTopupMsg(null);
                  const r = await fetch("/api/pengguna/wallet/topup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: +topupAmount, method: topupMethod }) });
                  const d = await r.json();
                  setTopupLoading(false);
                  if (d.ok) { setTopupMsg({ type: "ok", text: `Saldo berhasil ditambahkan!` }); setWalletData(w => w ? { ...w, balance: d.newBalance } : w); fetchWallet(); setTimeout(() => { setTopupModal(false); setTopupAmount(""); setTopupMsg(null); }, 1200); }
                  else setTopupMsg({ type: "err", text: d.error ?? "Gagal top-up" });
                }} style={{ width: "100%", background: !topupAmount || +topupAmount < 10000 ? "#b2dfdb" : "#1a7a6a", color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {topupLoading ? "Memproses..." : `Bayar ${topupAmount ? fmtRp(+topupAmount) : ""}`}
                </button>
                <button onClick={() => { setTopupModal(false); setTopupAmount(""); setTopupMsg(null); }}
                  style={{ width: "100%", background: "none", border: "none", fontSize: 14, color: "#7a8a9a", cursor: "pointer", padding: "6px 0" }}>Batal</button>
              </div>
            </div>
          )}

          {/* ── WITHDRAW MODAL ── */}
          {withdrawModal && (
            <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "28px 20px 36px", width: "100%", maxWidth: 480, boxShadow: "0 -8px 32px rgba(0,0,0,0.12)" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a3a", marginBottom: 4 }}>💸 Tarik Saldo</div>
                <div style={{ fontSize: 12, color: "#9aa5b4", marginBottom: 14 }}>Saldo tersedia: <strong>{fmtRp(walletData?.balance ?? 0)}</strong></div>
                <input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value.replace(/\D/g, ""))} placeholder="Nominal tarik (min. Rp 10.000)"
                  style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 10, outline: "none" }} />
                <input value={withdrawDest} onChange={e => setWithdrawDest(e.target.value)} placeholder="Tujuan: nama bank + no. rekening"
                  style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 14, outline: "none" }} />
                {withdrawMsg && <div style={{ fontSize: 12, color: withdrawMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{withdrawMsg.text}</div>}
                <button disabled={withdrawLoading || !withdrawAmount || +withdrawAmount < 10000 || !withdrawDest} onClick={async () => {
                  setWithdrawLoading(true); setWithdrawMsg(null);
                  const r = await fetch("/api/pengguna/wallet/withdraw", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: +withdrawAmount, destination: withdrawDest }) });
                  const d = await r.json();
                  setWithdrawLoading(false);
                  if (d.ok) { setWithdrawMsg({ type: "ok", text: "Penarikan berhasil diproses!" }); setWalletData(w => w ? { ...w, balance: d.newBalance } : w); fetchWallet(); setTimeout(() => { setWithdrawModal(false); setWithdrawAmount(""); setWithdrawDest(""); setWithdrawMsg(null); }, 1200); }
                  else setWithdrawMsg({ type: "err", text: d.error ?? "Gagal tarik saldo" });
                }} style={{ width: "100%", background: !withdrawAmount || +withdrawAmount < 10000 ? "#b2dfdb" : "#e74c3c", color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {withdrawLoading ? "Memproses..." : "Konfirmasi Penarikan"}
                </button>
                <button onClick={() => { setWithdrawModal(false); setWithdrawAmount(""); setWithdrawDest(""); setWithdrawMsg(null); }}
                  style={{ width: "100%", background: "none", border: "none", fontSize: 14, color: "#7a8a9a", cursor: "pointer", padding: "6px 0" }}>Batal</button>
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

          {/* Menu grup 2: Dompet & Pembayaran */}
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: "#9aa5b4", letterSpacing: 1, textTransform: "uppercase" as const }}>Dompet & Pembayaran</div>
            {/* RIDE Wallet */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "dompet" ? null : "dompet")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>💰</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>RIDE Wallet</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>Saldo: {walletLoading ? "..." : fmtRp(walletData?.balance ?? 0)}</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "dompet" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "dompet" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {/* Balance card */}
                  <div style={{ background: "linear-gradient(135deg, #0d2137 0%, #1a7a6a 100%)", borderRadius: 14, padding: "16px 16px 14px", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>Saldo RIDE Anda</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{walletLoading ? "..." : fmtRp(walletData?.balance ?? 0)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => { setTopupModal(true); setTopupMsg(null); }}
                        style={{ flex: 1, background: "#fff", border: "none", borderRadius: 10, padding: "8px 0", fontSize: 12, fontWeight: 800, color: "#1a7a6a", cursor: "pointer" }}>+ Isi Saldo</button>
                      <button onClick={() => { setWithdrawModal(true); setWithdrawMsg(null); }}
                        style={{ flex: 1, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "8px 0", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer" }}>↓ Tarik</button>
                    </div>
                  </div>
                  {/* Transactions */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1a2a3a", marginBottom: 8 }}>Riwayat Transaksi</div>
                  {(!walletData?.transactions?.length) && <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center" as const, padding: "12px 0" }}>Belum ada transaksi.</div>}
                  {walletData?.transactions?.slice(0, 10).map(tx => (
                    <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #f0f4f8" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: tx.type === "topup" ? "#e8f5f2" : "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {tx.type === "topup" ? "⬆️" : "⬇️"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a" }}>{tx.description}</div>
                        <div style={{ fontSize: 10, color: "#9aa5b4", marginTop: 1 }}>{new Date(tx.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: tx.type === "topup" ? "#1a7a6a" : "#e74c3c" }}>
                        {tx.type === "topup" ? "+" : "-"}{fmtRp(tx.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Metode Pembayaran */}
            <div>
              <button onClick={() => setOpenAkunSection(openAkunSection === "metode-bayar" ? null : "metode-bayar")}
                style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" as const, borderTop: "1px solid #f0f4f8" }}>
                <span style={{ fontSize: 20 }}>💳</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a" }}>Metode Pembayaran</div>
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>{paymentMethods.length} metode tersimpan</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "metode-bayar" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "metode-bayar" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {paymentMethods.map(pm => (
                    <div key={pm.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
                      <span style={{ fontSize: 18 }}>{pm.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{pm.label}</div>
                        <div style={{ fontSize: 11, color: "#9aa5b4" }}>{pm.type === "ewallet" ? "E-Wallet" : pm.type === "bank" ? "Rekening Bank" : "Kartu"}</div>
                      </div>
                      <button onClick={() => setPaymentMethods(m => m.filter(x => x.id !== pm.id))}
                        style={{ background: "none", border: "none", color: "#e74c3c", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  {!addingPayMethod ? (
                    <button onClick={() => setAddingPayMethod(true)}
                      style={{ width: "100%", background: "none", border: "1.5px dashed #b0bec5", borderRadius: 10, padding: "9px 0", fontSize: 13, color: "#9aa5b4", cursor: "pointer", marginTop: 10 }}>
                      + Tambah Metode Baru
                    </button>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <select value={newPayType} onChange={e => setNewPayType(e.target.value)}
                        style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, marginBottom: 6, outline: "none", background: "#fff" }}>
                        <option value="ewallet">E-Wallet</option>
                        <option value="bank">Rekening Bank</option>
                        <option value="card">Kartu Kredit/Debit</option>
                      </select>
                      <input value={newPayLabel} onChange={e => setNewPayLabel(e.target.value)} placeholder="Nama (misal: GoPay, BCA, Visa)"
                        style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" as const, marginBottom: 8, outline: "none" }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => {
                          if (!newPayLabel.trim()) return;
                          const icon = newPayType === "ewallet" ? "📱" : newPayType === "bank" ? "🏦" : "💳";
                          setPaymentMethods(m => [...m, { id: Date.now().toString(), type: newPayType, label: newPayLabel.trim(), icon }]);
                          setNewPayLabel(""); setAddingPayMethod(false);
                        }} style={{ flex: 1, background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 10, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Simpan</button>
                        <button onClick={() => setAddingPayMethod(false)}
                          style={{ flex: 1, background: "#f0f4f8", color: "#7a8a9a", border: "none", borderRadius: 10, padding: "8px 0", fontSize: 13, cursor: "pointer" }}>Batal</button>
                      </div>
                    </div>
                  )}
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
                  <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 1 }}>3 voucher tersedia</div>
                </div>
                <span style={{ fontSize: 16, color: "#b0bec5" }}>{openAkunSection === "voucher" ? "∨" : "›"}</span>
              </button>
              {openAkunSection === "voucher" && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f4f8" }}>
                  {[
                    { code: "RIDE10", desc: "Diskon 10% untuk order berikutnya", exp: "30 Apr 2026" },
                    { code: "RIDE20", desc: "Diskon 20% min. order Rp 150.000", exp: "15 Mei 2026" },
                    { code: "GRATIS", desc: "Gratis biaya panggilan 1x", exp: "01 Jun 2026" },
                  ].map(v => (
                    <div key={v.code} style={{ background: "#f0faf8", borderRadius: 12, padding: "10px 12px", marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#1a7a6a" }}>{v.code}</div>
                        <div style={{ fontSize: 11, color: "#5a7a6a", marginTop: 2 }}>{v.desc}</div>
                        <div style={{ fontSize: 10, color: "#9aa5b4", marginTop: 2 }}>s/d {v.exp}</div>
                      </div>
                      <button style={{ background: "#1a7a6a", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Pakai</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input value={voucherInput} onChange={e => setVoucherInput(e.target.value)} placeholder="Punya kode voucher?"
                      style={{ flex: 1, border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                    <button onClick={() => { if (voucherInput.trim()) { setVoucherMsg({ type: "err", text: "Kode tidak valid atau sudah digunakan." }); setVoucherInput(""); } }}
                      style={{ background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tukar</button>
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
                    Bagikan kode referral Anda ke teman. Setiap teman yang mendaftar dan menyelesaikan order pertama, Anda mendapat bonus Rp 25.000 ke RIDE Wallet.
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
                    { q: "Bagaimana cara membatalkan pesanan?", a: "Anda dapat membatalkan pesanan sebelum mitra menerima. Buka tab Pesanan dan pilih Batalkan Order." },
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
                  <textarea value={reportInput} onChange={e => setReportInput(e.target.value)} placeholder="Ceritakan masalah Anda secara detail..."
                    style={{ width: "100%", border: "1.5px solid #e0e8ef", borderRadius: 10, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" as const, resize: "none", height: 80, marginBottom: 10, outline: "none" }} />
                  {reportMsg && <div style={{ fontSize: 12, color: reportMsg.type === "ok" ? "#1a7a6a" : "#e74c3c", marginBottom: 8 }}>{reportMsg.text}</div>}
                  <button disabled={reportLoading || !reportInput.trim()} onClick={async () => {
                    setReportLoading(true); setReportMsg(null);
                    await new Promise(r => setTimeout(r, 800));
                    setReportLoading(false);
                    setReportMsg({ type: "ok", text: "Laporan berhasil dikirim! Tim kami akan menindaklanjuti dalam 1x24 jam." });
                    setReportInput("");
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
                  {reportList.length === 0 && <div style={{ fontSize: 12, color: "#9aa5b4", textAlign: "center" as const, padding: "12px 0" }}>Tidak ada tiket laporan aktif.</div>}
                  {reportList.map(t => (
                    <div key={t.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 12px", marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#1a3a5c" }}>{t.id}</div>
                        <span style={{ background: "#fff9e6", color: "#c8960c", fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 7px" }}>{t.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#1a2a3a" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: "#9aa5b4", marginTop: 4 }}>Dibuat: {t.date}</div>
                    </div>
                  ))}
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
