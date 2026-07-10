import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { socket, identifySocket } from "../lib/socket";
import { usePushNotification } from "../hooks/usePushNotification";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmtRp(n: number | null | undefined) {
  if (n == null) return "Rp 0";
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Merchant {
  id: number;
  ownerUserId: number;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  photoPath: string | null;
  isOpen: boolean;
  status: string;
  operatingCity: string | null;
}

interface Stats {
  pending: number;
  doneToday: number;
  revenueToday: number;
}

interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

interface MerchantOrder {
  id: number;
  orderNo: string;
  serviceType: string;
  status: string;
  merchantStatus: "menunggu" | "diterima" | "siap" | "ditolak";
  merchantReadyAt: string | null;
  orderItems: OrderItem[] | null;
  foodTotal: number | null;
  itemNote: string | null;
  destAddress: string | null;
  mitraId: number | null;
  trackingPhase: string | null;
  penggunaName: string | null;
  createdAt: string;
}

interface MenuItem {
  id: number;
  merchantId: number;
  name: string;
  description: string | null;
  price: number;
  photoPath: string | null;
  category: string | null;
  isAvailable: boolean;
}

type TabId = "beranda" | "pesanan" | "menu" | "akun";

export default function DashboardMerchant() {
  usePushNotification(true);
  const [, navigate] = useLocation();

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("beranda");
  const [togglingOpen, setTogglingOpen] = useState(false);

  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [history, setHistory] = useState<MerchantOrder[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/merchant/dashboard`, { credentials: "include" });
      if (res.status === 401) { navigate("/login"); return; }
      const d = await res.json();
      if (d.merchant) setMerchant(d.merchant);
      if (d.stats) setStats(d.stats);
    } catch { /* ignore */ }
  }, [navigate]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/merchant/orders`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) { navigate("/login"); return; }
      const d = await res.json();
      if (Array.isArray(d.orders)) setOrders(d.orders);
    } catch { /* ignore */ }
  }, [navigate]);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/merchant/menu`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) { navigate("/login"); return; }
      const d = await res.json();
      if (Array.isArray(d.menu)) setMenu(d.menu);
    } catch { /* ignore */ }
  }, [navigate]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/merchant/order-history`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) { navigate("/login"); return; }
      const d = await res.json();
      if (Array.isArray(d.orders)) setHistory(d.orders);
    } catch { /* ignore */ }
  }, [navigate]);

  // Initial load + auth check
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(`${BASE}/api/auth/me?role=merchant`, { credentials: "include" });
        if (meRes.status === 401) { navigate("/login"); return; }
        const me = await meRes.json();
        await fetchDashboard();
        await fetchOrders();
        await fetchMenu();
        if (me?.id) identifySocket(me.id, "merchant");
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket realtime events
  useEffect(() => {
    const onNew = () => { fetchOrders(); fetchDashboard(); };
    const onStatus = () => { fetchOrders(); fetchDashboard(); };
    socket.on("merchant:order:new", onNew);
    socket.on("order:merchant_status", onStatus);
    return () => {
      socket.off("merchant:order:new", onNew);
      socket.off("order:merchant_status", onStatus);
    };
  }, [fetchOrders, fetchDashboard]);

  // 30s polling backup for active orders
  useEffect(() => {
    pollRef.current = setInterval(() => { fetchOrders(); fetchDashboard(); }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders, fetchDashboard]);

  const toggleOpen = async () => {
    if (!merchant || togglingOpen) return;
    setTogglingOpen(true);
    const next = !merchant.isOpen;
    try {
      const res = await fetch(`${BASE}/api/merchant/toggle-open`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: next }),
      });
      if (res.ok) {
        const d = await res.json();
        setMerchant(m => m ? { ...m, isOpen: d.isOpen ?? next } : m);
      }
    } catch { /* ignore */ }
    finally { setTogglingOpen(false); }
  };

  const acceptOrder = async (id: number) => {
    try {
      const res = await fetch(`${BASE}/api/merchant/orders/${id}/accept`, { method: "PATCH", credentials: "include" });
      if (res.ok) { fetchOrders(); fetchDashboard(); }
    } catch { /* ignore */ }
  };

  const readyOrder = async (id: number) => {
    try {
      const res = await fetch(`${BASE}/api/merchant/orders/${id}/ready`, { method: "PATCH", credentials: "include" });
      if (res.ok) { fetchOrders(); fetchDashboard(); }
    } catch { /* ignore */ }
  };

  const rejectOrder = async (id: number) => {
    const reason = window.prompt("Alasan menolak pesanan:");
    if (reason == null || !reason.trim()) return;
    try {
      const res = await fetch(`${BASE}/api/merchant/orders/${id}/reject`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) { fetchOrders(); fetchDashboard(); }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 45%, #1c4a5a 100%)" }}>
        <div style={{ color: "#fff", fontSize: 16, fontFamily: "'Inter', sans-serif" }}>Memuat...</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(160deg, #0d2137 0%, #1a3a5c 45%, #1c4a5a 100%)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flex: "0 0 auto", padding: "48px 20px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🍽️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: "'Inter', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{merchant?.name ?? "Warung"}</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>{merchant?.isOpen ? "Warung Buka" : "Warung Tutup"}</div>
        </div>
      </div>

      {/* Content card */}
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", overflowY: "auto", paddingBottom: 88 }}>
        {activeTab === "beranda" && (
          <Beranda merchant={merchant} stats={stats} onToggle={toggleOpen} toggling={togglingOpen} />
        )}
        {activeTab === "pesanan" && (
          <Pesanan orders={orders} onAccept={acceptOrder} onReady={readyOrder} onReject={rejectOrder} />
        )}
        {activeTab === "menu" && (
          <MenuTab menu={menu} refetch={fetchMenu} />
        )}
        {activeTab === "akun" && (
          <Akun merchant={merchant} history={history} fetchHistory={fetchHistory} navigate={navigate} />
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e0eaf0", display: "flex", padding: "10px 8px 22px", boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}>
        {([
          { id: "beranda" as const, label: "Beranda", icon: "🏠" },
          { id: "pesanan" as const, label: "Pesanan", icon: "🧾", badge: stats?.pending ?? 0 },
          { id: "menu" as const, label: "Menu", icon: "📋" },
          { id: "akun" as const, label: "Akun", icon: "👤" },
        ]).map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "pesanan") fetchOrders();
                if (tab.id === "menu") fetchMenu();
                if (tab.id === "akun") fetchHistory();
              }}
              style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", position: "relative" }}
            >
              <span style={{ fontSize: 20, opacity: active ? 1 : 0.5, position: "relative" }}>
                {tab.icon}
                {"badge" in tab && (tab.badge ?? 0) > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -10, background: "#c0392b", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 16, height: 16, padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>{tab.badge}</span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? "#1a7a6a" : "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    approved: { label: "Aktif", color: "#2ecc71" },
    pending: { label: "Menunggu", color: "#f39c12" },
    rejected: { label: "Ditolak", color: "#c0392b" },
    suspended: { label: "Ditangguhkan", color: "#c0392b" },
  };
  return map[status] ?? { label: status, color: "#7a8a9a" };
}

function Beranda({ merchant, stats, onToggle, toggling }: { merchant: Merchant | null; stats: Stats | null; onToggle: () => void; toggling: boolean }) {
  const badge = statusBadge(merchant?.status ?? "pending");
  return (
    <div style={{ padding: "24px 20px 24px" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", borderRadius: 20, padding: "20px", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Inter', sans-serif" }}>{merchant?.name ?? "Warung"}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "'Inter', sans-serif", marginTop: 4, textTransform: "capitalize" }}>{merchant?.category ?? "food"}</div>
            <span style={{ display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 700, fontFamily: "'Inter', sans-serif", color: "#fff", background: badge.color, borderRadius: 20, padding: "3px 12px" }}>{badge.label}</span>
          </div>
        </div>
        {/* Open toggle */}
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 16px" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>{merchant?.isOpen ? "Warung Buka" : "Warung Tutup"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "'Inter', sans-serif" }}>{merchant?.isOpen ? "Menerima pesanan" : "Tidak menerima pesanan"}</div>
          </div>
          <button
            onClick={onToggle}
            disabled={toggling}
            style={{ width: 56, height: 30, borderRadius: 15, border: "none", cursor: toggling ? "not-allowed" : "pointer", background: merchant?.isOpen ? "#2ecc71" : "rgba(255,255,255,0.3)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 3, left: merchant?.isOpen ? 29 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="Pesanan Aktif" value={String(stats?.pending ?? 0)} accent="#f39c12" />
        <StatCard label="Selesai Hari Ini" value={String(stats?.doneToday ?? 0)} accent="#1a7a6a" />
        <div style={{ gridColumn: "1 / -1" }}>
          <StatCard label="Pendapatan Hari Ini" value={fmtRp(stats?.revenueToday)} accent="#2ecc71" big />
        </div>
      </div>

      {merchant?.address && (
        <div style={{ marginTop: 20, background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>Alamat Warung</div>
          <div style={{ fontSize: 14, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{merchant.address}</div>
          {merchant.operatingCity && <div style={{ fontSize: 13, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>{merchant.operatingCity}</div>}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, big }: { label: string; value: string; accent: string; big?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>{label}</div>
      <div style={{ fontSize: big ? 24 : 22, fontWeight: 800, color: accent, fontFamily: "'Inter', sans-serif", marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Pesanan({ orders, onAccept, onReady, onReject }: { orders: MerchantOrder[]; onAccept: (id: number) => void; onReady: (id: number) => void; onReject: (id: number) => void }) {
  const active = orders.filter(o => o.merchantStatus !== "ditolak");
  return (
    <div style={{ padding: "24px 20px 24px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Pesanan Masuk</div>
      {active.length === 0 ? (
        <div style={{ textAlign: "center", color: "#7a8a9a", fontSize: 14, fontFamily: "'Inter', sans-serif", marginTop: 40 }}>
          Belum ada pesanan aktif.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {active.map(o => <OrderCard key={o.id} order={o} onAccept={onAccept} onReady={onReady} onReject={onReject} />)}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onAccept, onReady, onReject }: { order: MerchantOrder; onAccept: (id: number) => void; onReady: (id: number) => void; onReject: (id: number) => void }) {
  const ms = order.merchantStatus;
  const badge = ms === "menunggu" ? { label: "Baru Masuk", color: "#f39c12" }
    : ms === "diterima" ? { label: "Sedang Dimasak", color: "#1a7a6a" }
    : ms === "siap" ? { label: "Siap Diambil", color: "#2ecc71" }
    : { label: "Ditolak", color: "#c0392b" };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>#{order.orderNo}</div>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Inter', sans-serif", color: "#fff", background: badge.color, borderRadius: 20, padding: "3px 12px" }}>{badge.label}</span>
      </div>
      <div style={{ fontSize: 13, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", marginTop: 4 }}>
        {order.penggunaName ?? "Pelanggan"} · {fmtDate(order.createdAt)}
      </div>

      <div style={{ marginTop: 12, borderTop: "1px solid #f0f4f8", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {(order.orderItems ?? []).map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#1a2a3a" }}>
            <span>{it.name} <span style={{ color: "#7a8a9a" }}>x{it.qty}</span></span>
            {it.price != null && <span style={{ color: "#7a8a9a" }}>{fmtRp(it.price * it.qty)}</span>}
          </div>
        ))}
      </div>

      {order.itemNote && (
        <div style={{ marginTop: 10, fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", background: "#f0f4f8", borderRadius: 10, padding: "8px 12px" }}>
          Catatan: {order.itemNote}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>Total Makanan</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>{fmtRp(order.foodTotal)}</span>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        {ms === "menunggu" && (
          <>
            <button onClick={() => onReject(order.id)} style={{ padding: "12px 18px", borderRadius: 12, border: "1.5px solid #f0c0bc", background: "#fff", color: "#c0392b", fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>Tolak</button>
            <button onClick={() => onAccept(order.id)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>Terima Pesanan</button>
          </>
        )}
        {ms === "diterima" && (
          <button onClick={() => onReady(order.id)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1a7a6a 0%, #2ecc71 100%)", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>Makanan Siap</button>
        )}
        {ms === "siap" && (
          <div style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 12, background: "#f0f4f8", color: "#1a7a6a", fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif" }}>Menunggu ojol menjemput</div>
        )}
      </div>
    </div>
  );
}

interface MenuFormState {
  id: number | null;
  name: string;
  price: string;
  category: string;
  description: string;
  photo: File | null;
}

const EMPTY_MENU_FORM: MenuFormState = { id: null, name: "", price: "", category: "", description: "", photo: null };

function MenuTab({ menu, refetch }: { menu: MenuItem[]; refetch: () => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MenuFormState>(EMPTY_MENU_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const openAdd = () => { setForm(EMPTY_MENU_FORM); setError(null); setModalOpen(true); };
  const openEdit = (m: MenuItem) => {
    setForm({ id: m.id, name: m.name, price: String(m.price), category: m.category ?? "", description: m.description ?? "", photo: null });
    setError(null);
    setModalOpen(true);
  };

  const toggleAvailable = async (m: MenuItem) => {
    try {
      const fd = new FormData();
      fd.append("isAvailable", String(!m.isAvailable));
      const res = await fetch(`${BASE}/api/merchant/menu/${m.id}`, { method: "PATCH", credentials: "include", body: fd });
      if (res.ok) refetch();
    } catch { /* ignore */ }
  };

  const deleteItem = async (m: MenuItem) => {
    if (!window.confirm(`Hapus menu "${m.name}"?`)) return;
    try {
      const res = await fetch(`${BASE}/api/merchant/menu/${m.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) refetch();
    } catch { /* ignore */ }
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Nama menu wajib diisi"); return; }
    const priceNum = parseInt(form.price.replace(/\D/g, ""));
    if (!priceNum || priceNum <= 0) { setError("Harga tidak valid"); return; }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("price", String(priceNum));
      fd.append("category", form.category.trim());
      fd.append("description", form.description.trim());
      if (form.photo) fd.append("photo", form.photo);
      const url = form.id != null ? `${BASE}/api/merchant/menu/${form.id}` : `${BASE}/api/merchant/menu`;
      const method = form.id != null ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", body: fd });
      if (res.ok) { setModalOpen(false); refetch(); }
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Gagal menyimpan menu");
      }
    } catch { setError("Gagal menghubungi server"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "24px 20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>Menu Warung</div>
        <button onClick={openAdd} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>+ Tambah Menu</button>
      </div>

      {menu.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 48, padding: "0 24px" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#eef3f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🍽️</div>
          <div style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>Belum ada menu</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
            Tambahkan menu pertama Anda agar warung bisa mulai menerima pesanan dari pelanggan.
          </div>
          <button onClick={openAdd} style={{ marginTop: 20, padding: "13px 24px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>
            + Tambah Menu Pertama
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {menu.map(m => (
            <div key={m.id} style={{ background: "#fff", borderRadius: 16, padding: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 60, height: 60, borderRadius: 12, background: "#f0f4f8", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                {m.photoPath ? <img src={m.photoPath} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🍲"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                {m.category && <div style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>{m.category}</div>}
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", marginTop: 2 }}>{fmtRp(m.price)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <button
                  onClick={() => toggleAvailable(m)}
                  style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: m.isAvailable ? "#2ecc71" : "#d0dce8", position: "relative", flexShrink: 0 }}
                >
                  <span style={{ position: "absolute", top: 3, left: m.isAvailable ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEdit(m)} style={{ fontSize: 12, fontWeight: 600, color: "#1a3a5c", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Edit</button>
                  <button onClick={() => deleteItem(m)} style={{ fontSize: 12, fontWeight: 600, color: "#c0392b", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Hapus</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,33,55,0.6)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setModalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#f0f4f8", borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "85%", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>{form.id != null ? "Edit Menu" : "Tambah Menu"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <MField label="Nama Menu">
                <MInput value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Contoh: Nasi Goreng Spesial" />
              </MField>
              <MField label="Harga (Rp)">
                <MInput value={form.price} onChange={v => setForm(f => ({ ...f, price: v.replace(/\D/g, "") }))} placeholder="15000" type="tel" />
              </MField>
              <MField label="Kategori">
                <MInput value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="Contoh: Makanan / Minuman" />
              </MField>
              <MField label="Deskripsi (opsional)">
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Deskripsi singkat menu..."
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff", color: "#1a2a3a", resize: "vertical" }} />
              </MField>
              <MField label="Foto Menu (opsional)">
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setForm(fm => ({ ...fm, photo: f })); }} />
                <button onClick={() => photoRef.current?.click()} style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px dashed #d0dce8", background: "#fff", color: "#1a3a5c", fontWeight: 600, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: "pointer", width: "100%", textAlign: "left" }}>
                  {form.photo ? `✓ ${form.photo.name}` : "Pilih foto..."}
                </button>
              </MField>
            </div>
            {error && <div style={{ marginTop: 12, color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>{error}</div>}
            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: "14px 20px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 15, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>Batal</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: saving ? "#b0c4d0" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "'Inter', sans-serif", cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function MInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff", color: "#1a2a3a" }} />
  );
}

function Akun({ merchant, history, fetchHistory, navigate }: { merchant: Merchant | null; history: MerchantOrder[]; fetchHistory: () => void; navigate: (to: string) => void }) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [cpOld, setCpOld] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpLoading, setCpLoading] = useState(false);
  const [cpMsg, setCpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const changePassword = async () => {
    setCpMsg(null);
    if (cpNew.length < 8) { setCpMsg({ type: "err", text: "Password baru minimal 8 karakter" }); return; }
    if (cpNew !== cpConfirm) { setCpMsg({ type: "err", text: "Konfirmasi password tidak cocok" }); return; }
    setCpLoading(true);
    try {
      const res = await fetch(`${BASE}/api/merchant/change-password`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: cpOld, newPassword: cpNew }),
      });
      if (res.ok) {
        setCpMsg({ type: "ok", text: "Password berhasil diubah" });
        setCpOld(""); setCpNew(""); setCpConfirm("");
      } else {
        const d = await res.json().catch(() => ({}));
        setCpMsg({ type: "err", text: d.error ?? "Gagal mengubah password" });
      }
    } catch { setCpMsg({ type: "err", text: "Gagal menghubungi server" }); }
    finally { setCpLoading(false); }
  };

  const logout = async () => {
    try { localStorage.removeItem("ride-last-role"); } catch { /* ignore */ }
    try {
      await fetch(`${BASE}/api/auth/logout`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "merchant" }),
      });
    } catch { /* ignore */ }
    navigate("/login");
  };

  const toggleSection = (id: string) => {
    setOpenSection(prev => {
      const next = prev === id ? null : id;
      if (next === "riwayat") fetchHistory();
      return next;
    });
  };

  return (
    <div style={{ padding: "24px 20px 24px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Akun Warung</div>

      {/* Shop info */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, overflow: "hidden" }}>
            {merchant?.photoPath ? <img src={merchant.photoPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🍽️"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>{merchant?.name ?? "Warung"}</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>{merchant?.phone ?? "-"}</div>
          </div>
        </div>
        {merchant?.description && <div style={{ marginTop: 12, fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{merchant.description}</div>}
      </div>

      {/* Ganti password */}
      <Section title="Ganti Password" open={openSection === "password"} onToggle={() => toggleSection("password")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MInput value={cpOld} onChange={setCpOld} placeholder="Password lama" type="password" />
          <MInput value={cpNew} onChange={setCpNew} placeholder="Password baru (min. 8)" type="password" />
          <MInput value={cpConfirm} onChange={setCpConfirm} placeholder="Konfirmasi password baru" type="password" />
          {cpMsg && <div style={{ fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center", color: cpMsg.type === "ok" ? "#1a7a6a" : "#c0392b" }}>{cpMsg.text}</div>}
          <button onClick={changePassword} disabled={cpLoading} style={{ padding: "13px", borderRadius: 12, border: "none", background: cpLoading ? "#b0c4d0" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif", cursor: cpLoading ? "not-allowed" : "pointer" }}>{cpLoading ? "Menyimpan..." : "Simpan Password"}</button>
        </div>
      </Section>

      {/* Riwayat */}
      <Section title="Riwayat Pesanan" open={openSection === "riwayat"} onToggle={() => toggleSection("riwayat")}>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", color: "#7a8a9a", fontSize: 14, fontFamily: "'Inter', sans-serif", padding: "12px 0" }}>Belum ada riwayat pesanan.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map(o => (
              <div key={o.id} style={{ borderBottom: "1px solid #f0f4f8", paddingBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>#{o.orderNo}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>{fmtRp(o.foodTotal)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
                  {o.penggunaName ?? "Pelanggan"} · {fmtDate(o.createdAt)} · {o.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Logout */}
      <button onClick={logout} style={{ marginTop: 8, width: "100%", padding: "15px", borderRadius: 14, border: "1.5px solid #f0c0bc", background: "#fff", color: "#c0392b", fontWeight: 700, fontSize: 15, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>Keluar dari Akun</button>
    </div>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 14, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "16px 18px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>{title}</span>
        <span style={{ fontSize: 16, color: "#7a8a9a", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}
