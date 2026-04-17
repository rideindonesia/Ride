import { useQuery } from "@tanstack/react-query";
import { api, rupiahFormat } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface KeuanganSummary {
  allTimeTotal: number; allTimeOrders: number;
  thisMonthTotal: number; thisMonthOrders: number;
  lastMonthTotal: number; lastMonthOrders: number;
}

interface FeePerMitra {
  mitraId: number; mitraName: string; mitraEmail: string; totalFee: number; totalOrders: number;
}

export default function Keuangan() {
  const [page, setPage] = useState(1);
  const { data: summary } = useQuery<KeuanganSummary>({
    queryKey: ["keuangan-summary"],
    queryFn: () => api.get("/admin/keuangan/summary"),
  });
  const { data: feeRows } = useQuery<FeePerMitra[]>({
    queryKey: ["fee-per-mitra", page],
    queryFn: () => api.get(`/admin/keuangan/fee-per-mitra?page=${page}&limit=20`),
  });

  const mom = summary
    ? summary.lastMonthTotal > 0
      ? Math.round(((summary.thisMonthTotal - summary.lastMonthTotal) / summary.lastMonthTotal) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Keuangan & Platform Fee</h1>
        <p className="text-sm text-gray-500">Ringkasan pendapatan dari platform fee mitra</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Platform Fee" value={summary ? rupiahFormat(summary.allTimeTotal) : "–"} subtitle={`${summary?.allTimeOrders ?? 0} order selesai`} icon={Wallet} color="#1a7a6a" />
        <StatCard title="Bulan Ini" value={summary ? rupiahFormat(summary.thisMonthTotal) : "–"} subtitle={`${summary?.thisMonthOrders ?? 0} order`} icon={TrendingUp} color="#1a3a5c" trend={summary ? { value: mom, label: "vs bulan lalu" } : undefined} />
        <StatCard title="Bulan Lalu" value={summary ? rupiahFormat(summary.lastMonthTotal) : "–"} subtitle={`${summary?.lastMonthOrders ?? 0} order`} icon={BarChart3} color="#f59e0b" />
      </div>

      {/* Fee per Mitra */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Platform Fee per Mitra</h3>
          <p className="text-xs text-gray-400 mt-0.5">Diurutkan dari fee terbesar</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["#", "Nama Mitra", "Email", "Total Order", "Total Platform Fee"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(feeRows ?? []).map((r, i) => (
                <tr key={r.mitraId} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * 20 + i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.mitraName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.mitraEmail}</td>
                  <td className="px-4 py-3 text-gray-700">{r.totalOrders}</td>
                  <td className="px-4 py-3 font-semibold text-[#1a7a6a]">{rupiahFormat(r.totalFee)}</td>
                </tr>
              ))}
              {!(feeRows ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data keuangan</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">Halaman {page}</p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button onClick={() => setPage(p => p+1)} disabled={(feeRows?.length ?? 0) < 20} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
