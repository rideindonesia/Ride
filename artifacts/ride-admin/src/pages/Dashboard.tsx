import { useQuery } from "@tanstack/react-query";
import { api, rupiahFormat, SERVICE_LABELS, SERVICE_COLORS } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { ShoppingBag, Wallet, Users, Wrench, AlertCircle, Activity } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

interface Stats {
  ordersToday: number; ordersWeek: number; ordersMonth: number; totalOrders: number;
  totalPlatformFee: number; weekPlatformFee: number; pendingMitra: number;
  totalMitra: number; totalPengguna: number; newPenggunaWeek: number; activeOrders: number;
}

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({ queryKey: ["dashboard-stats"], queryFn: () => api.get("/admin/dashboard/stats") });
  const { data: ordersChart } = useQuery<{ date: string; count: number }[]>({ queryKey: ["chart-orders"], queryFn: () => api.get("/admin/dashboard/chart/orders") });
  const { data: revenueChart } = useQuery<{ date: string; revenue: number }[]>({ queryKey: ["chart-revenue"], queryFn: () => api.get("/admin/dashboard/chart/revenue") });
  const { data: byService } = useQuery<{ serviceType: string; count: number; fee: number }[]>({ queryKey: ["chart-service"], queryFn: () => api.get("/admin/dashboard/chart/by-service") });

  const fmtD = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ringkasan performa platform RIDE</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard title="Order Hari Ini" value={stats?.ordersToday ?? "–"} subtitle="Status: selesai" icon={ShoppingBag} color="#1a7a6a" />
        <StatCard title="Order Minggu Ini" value={stats?.ordersWeek ?? "–"} subtitle="7 hari terakhir" icon={ShoppingBag} color="#1a3a5c" />
        <StatCard title="Pendapatan Bulan Ini" value={stats ? rupiahFormat(stats.weekPlatformFee) : "–"} subtitle="Platform fee minggu ini" icon={Wallet} color="#f59e0b" />
        <StatCard title="Total Platform Fee" value={stats ? rupiahFormat(stats.totalPlatformFee) : "–"} subtitle={`Dari ${stats?.totalOrders ?? 0} order selesai`} icon={Wallet} color="#8b5cf6" />
        <StatCard title="Mitra Aktif" value={stats?.totalMitra ?? "–"} subtitle={`${stats?.pendingMitra ?? 0} menunggu verifikasi`} icon={Wrench} color="#1a7a6a" />
        <StatCard title="Pengguna Terdaftar" value={stats?.totalPengguna ?? "–"} subtitle={`+${stats?.newPenggunaWeek ?? 0} minggu ini`} icon={Users} color="#1a3a5c" />
        <StatCard title="Order Aktif" value={stats?.activeOrders ?? "–"} subtitle="Pending + Diterima" icon={Activity} color="#ec4899" />
        <StatCard title="Antrian Mitra" value={stats?.pendingMitra ?? "–"} subtitle="Perlu diverifikasi" icon={AlertCircle} color="#ef4444" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Order Selesai — 14 Hari Terakhir</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ordersChart ?? []}>
              <defs>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a7a6a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1a7a6a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={fmtD} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, "Order"]} labelFormatter={fmtD} />
              <Area type="monotone" dataKey="count" stroke="#1a7a6a" fill="url(#colorOrders)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Platform Fee — 14 Hari Terakhir</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueChart ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={fmtD} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [rupiahFormat(Number(v)), "Platform Fee"]} labelFormatter={fmtD} />
              <Bar dataKey="revenue" fill="#1a3a5c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Order Per Layanan</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byService?.map(s => ({ ...s, name: SERVICE_LABELS[s.serviceType] ?? s.serviceType })) ?? []} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {(byService ?? []).map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [v, "Order"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Platform Fee Per Layanan</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byService?.map(s => ({ ...s, name: SERVICE_LABELS[s.serviceType] ?? s.serviceType })) ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: any) => [rupiahFormat(Number(v)), "Platform Fee"]} />
              <Bar dataKey="fee" radius={[0, 4, 4, 0]}>
                {(byService ?? []).map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
