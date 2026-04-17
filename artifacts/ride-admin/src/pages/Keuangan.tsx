import { useQuery } from "@tanstack/react-query";
import { api, rupiahFormat } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, BarChart3, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface KeuanganSummary {
  allTimeTotal: number; allTimeOrders: number;
  thisMonthTotal: number; thisMonthOrders: number;
  lastMonthTotal: number; lastMonthOrders: number;
  unpaidTotal: number; unpaidOrders: number;
  unpaidThisMonth: number; unpaidThisMonthOrders: number;
}

interface FeePerMitra {
  mitraId: number; mitraName: string; mitraEmail: string;
  totalFee: number; totalOrders: number; unpaidFee: number;
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

  const totalUnpaidInTable = (feeRows ?? []).reduce((s, r) => s + r.unpaidFee, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Keuangan & Platform Fee</h1>
        <p className="text-sm text-gray-500">Ringkasan pendapatan dari platform fee mitra</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Platform Fee"
          value={summary ? rupiahFormat(summary.allTimeTotal) : "–"}
          subtitle={`${summary?.allTimeOrders ?? 0} order selesai`}
          icon={Wallet}
          color="#1a7a6a"
        />
        <StatCard
          title="Bulan Ini"
          value={summary ? rupiahFormat(summary.thisMonthTotal) : "–"}
          subtitle={`${summary?.thisMonthOrders ?? 0} order`}
          icon={TrendingUp}
          color="#1a3a5c"
          trend={summary ? { value: mom, label: "vs bulan lalu" } : undefined}
        />
        <StatCard
          title="Bulan Lalu"
          value={summary ? rupiahFormat(summary.lastMonthTotal) : "–"}
          subtitle={`${summary?.lastMonthOrders ?? 0} order`}
          icon={BarChart3}
          color="#f59e0b"
        />
        <StatCard
          title="Fee Belum Dibayar"
          value={summary ? rupiahFormat(summary.unpaidTotal) : "–"}
          subtitle={`${summary?.unpaidOrders ?? 0} order tunai`}
          icon={AlertCircle}
          color="#ef4444"
        />
      </div>

      {/* Unpaid warning banner */}
      {summary && summary.unpaidTotal > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-700">
              {rupiahFormat(summary.unpaidTotal)} platform fee belum diterima RIDE
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              Berasal dari {summary.unpaidOrders} order dengan pembayaran tunai (cash) — mitra menerima langsung dari konsumen dan belum menyetorkan bagian fee ke platform.
              {summary.unpaidThisMonth > 0 && ` Bulan ini: ${rupiahFormat(summary.unpaidThisMonth)} dari ${summary.unpaidThisMonthOrders} order.`}
            </p>
          </div>
        </div>
      )}

      {summary && summary.unpaidTotal === 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
          <p className="text-sm text-green-700 font-medium">Semua platform fee sudah terbayar. Tidak ada tunggakan.</p>
        </div>
      )}

      {/* Fee per Mitra */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Platform Fee per Mitra</h3>
            <p className="text-xs text-gray-400 mt-0.5">Diurutkan dari fee terbesar</p>
          </div>
          {totalUnpaidInTable > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Total belum dibayar (halaman ini)</p>
              <p className="text-sm font-bold text-red-600">{rupiahFormat(totalUnpaidInTable)}</p>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["#", "Nama Mitra", "Email", "Total Order", "Total Platform Fee", "Fee Belum Dibayar", "Fee Sudah Diterima"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(feeRows ?? []).map((r, i) => {
                const paidFee = r.totalFee - r.unpaidFee;
                return (
                  <tr key={r.mitraId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * 20 + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.mitraName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.mitraEmail}</td>
                    <td className="px-4 py-3 text-gray-700">{r.totalOrders}</td>
                    <td className="px-4 py-3 font-semibold text-[#1a7a6a]">{rupiahFormat(r.totalFee)}</td>
                    <td className="px-4 py-3">
                      {r.unpaidFee > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                          <span className="font-semibold text-red-600">{rupiahFormat(r.unpaidFee)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {paidFee > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>
                          <span className="font-semibold text-green-600">{rupiahFormat(paidFee)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!(feeRows ?? []).length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data keuangan</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            <span><b>Fee Belum Dibayar</b> — order dibayar tunai (cash), mitra belum setor ke RIDE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span><b>Fee Sudah Diterima</b> — dipotong otomatis via RIDE Wallet / Transfer</span>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
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
