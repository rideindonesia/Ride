import { useQuery } from "@tanstack/react-query";
import { api, rupiahFormat, SERVICE_LABELS, SERVICE_COLORS } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Legend
} from "recharts";

interface ByService { serviceType: string; count: number; fee: number; avgTotal: number }
interface ByCity { city: string; count: number; fee: number }
interface TopMitra { mitraId: number; mitraName: string; totalOrders: number; totalFee: number; avgRating: number | null }

export default function Laporan() {
  const { data: byService } = useQuery<ByService[]>({ queryKey: ["laporan-service"], queryFn: () => api.get("/admin/laporan/by-service") });
  const { data: byCity } = useQuery<ByCity[]>({ queryKey: ["laporan-city"], queryFn: () => api.get("/admin/laporan/by-city") });
  const { data: topMitra } = useQuery<TopMitra[]>({ queryKey: ["laporan-top-mitra"], queryFn: () => api.get("/admin/laporan/top-mitra") });

  const serviceData = (byService ?? []).map(s => ({ ...s, name: SERVICE_LABELS[s.serviceType] ?? s.serviceType }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan & Analitik</h1>
        <p className="text-sm text-gray-500">Analisis performa layanan dan mitra</p>
      </div>

      {/* Order & Fee per Layanan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Order Selesai per Layanan</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serviceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, "Order"]} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {serviceData.map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Rata-rata Nilai Order per Layanan (Rp)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serviceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={65} />
              <Tooltip formatter={(v: any) => [rupiahFormat(Number(v)), "Rata-rata"]} />
              <Bar dataKey="avgTotal" radius={[0, 4, 4, 0]}>
                {serviceData.map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Platform Fee Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribusi Platform Fee per Layanan</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={serviceData.map(s => ({ name: s.name, value: s.fee }))} dataKey="value" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={true}>
                {serviceData.map((_, i) => <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => rupiahFormat(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Order per Kota</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCity ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => [v, "Order"]} />
              <Bar dataKey="count" fill="#1a3a5c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Mitra */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Top 10 Mitra Terbaik</h3>
          <p className="text-xs text-gray-400 mt-0.5">Berdasarkan jumlah order selesai</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["#", "Nama Mitra", "Total Order", "Total Platform Fee", "Rating Rata-rata"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(topMitra ?? []).map((m, i) => (
                <tr key={m.mitraId} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i < 3 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.mitraName}</td>
                  <td className="px-4 py-3 text-gray-700">{m.totalOrders}</td>
                  <td className="px-4 py-3 font-semibold text-[#1a7a6a]">{rupiahFormat(m.totalFee)}</td>
                  <td className="px-4 py-3">
                    {m.avgRating ? (
                      <span className="flex items-center gap-1">
                        <span className="text-yellow-400">★</span>
                        <span className="text-gray-700 font-medium">{m.avgRating}</span>
                      </span>
                    ) : <span className="text-gray-300">–</span>}
                  </td>
                </tr>
              ))}
              {!(topMitra ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
