import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, rupiahFormat } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, BarChart3, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, BadgeCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface KeuanganSummary {
  allTimeTotal: number; allTimeOrders: number;
  thisMonthTotal: number; thisMonthOrders: number;
  lastMonthTotal: number; lastMonthOrders: number;
  unpaidTotal: number; unpaidOrders: number;
  unpaidThisMonth: number; unpaidThisMonthOrders: number;
  paidTotal: number; paidOrders: number;
}

interface FeePerMitra {
  mitraId: number; mitraName: string; mitraEmail: string;
  totalFee: number; totalOrders: number;
  unpaidFee: number; unpaidOrders: number;
}

export default function Keuangan() {
  const [page, setPage] = useState(1);
  const [confirmMitra, setConfirmMitra] = useState<FeePerMitra | null>(null);
  const qc = useQueryClient();

  const { data: summary } = useQuery<KeuanganSummary>({
    queryKey: ["keuangan-summary"],
    queryFn: () => api.get("/admin/keuangan/summary"),
  });

  const { data: feeRows } = useQuery<FeePerMitra[]>({
    queryKey: ["fee-per-mitra", page],
    queryFn: () => api.get(`/admin/keuangan/fee-per-mitra?page=${page}&limit=20`),
  });

  const markPaidMut = useMutation({
    mutationFn: (mitraId: number) => api.patch(`/admin/keuangan/mark-paid/${mitraId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keuangan-summary"] });
      qc.invalidateQueries({ queryKey: ["fee-per-mitra"] });
      setConfirmMitra(null);
    },
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
        <p className="text-sm text-gray-500">
          Semua pembayaran (cash, transfer, QRIS) diterima mitra. RIDE menagih platform fee dari mitra.
        </p>
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
          title="Fee Belum Diterima"
          value={summary ? rupiahFormat(summary.unpaidTotal) : "–"}
          subtitle={`${summary?.unpaidOrders ?? 0} order belum lunas`}
          icon={AlertCircle}
          color="#ef4444"
        />
        <StatCard
          title="Fee Sudah Diterima"
          value={summary ? rupiahFormat(summary.paidTotal) : "–"}
          subtitle={`${summary?.paidOrders ?? 0} order lunas`}
          icon={BadgeCheck}
          color="#1a7a6a"
        />
      </div>

      {/* Banner */}
      {summary && summary.unpaidTotal > 0 ? (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-700">
              {rupiahFormat(summary.unpaidTotal)} platform fee belum disetorkan mitra ke RIDE
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              Dari {summary.unpaidOrders} order selesai yang belum ditandai lunas.
              {summary.unpaidThisMonth > 0 && ` Bulan ini: ${rupiahFormat(summary.unpaidThisMonth)} dari ${summary.unpaidThisMonthOrders} order.`}
              {" "}Gunakan tombol <b>Tandai Lunas</b> di tabel bawah setelah mitra menyetor fee ke RIDE.
            </p>
          </div>
        </div>
      ) : summary ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            Semua platform fee sudah diterima RIDE. Tidak ada tunggakan dari mitra.
          </p>
        </div>
      ) : null}

      {/* Fee per Mitra table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Platform Fee per Mitra</h3>
          <p className="text-xs text-gray-400 mt-0.5">Diurutkan dari fee terbesar • Tandai lunas setelah mitra menyetor ke RIDE</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["#", "Nama Mitra", "Email", "Total Order", "Total Fee", "Belum Diterima", "Sudah Diterima", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(feeRows ?? []).map((r, i) => {
                const paidFee = r.totalFee - r.unpaidFee;
                return (
                  <tr key={r.mitraId} className={cn("hover:bg-gray-50/50 transition-colors", r.unpaidFee > 0 && "bg-red-50/30")}>
                    <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * 20 + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.mitraName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.mitraEmail}</td>
                    <td className="px-4 py-3 text-gray-700">{r.totalOrders}</td>
                    <td className="px-4 py-3 font-semibold text-[#1a7a6a]">{rupiahFormat(r.totalFee)}</td>
                    <td className="px-4 py-3">
                      {r.unpaidFee > 0 ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse"></span>
                            <span className="font-semibold text-red-600">{rupiahFormat(r.unpaidFee)}</span>
                          </div>
                          <p className="text-xs text-red-400 mt-0.5">{r.unpaidOrders} order</p>
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
                    <td className="px-4 py-3">
                      {r.unpaidFee > 0 ? (
                        <button
                          onClick={() => setConfirmMitra(r)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1a7a6a] text-white rounded-lg text-xs font-medium hover:bg-[#15665a] transition-colors whitespace-nowrap"
                        >
                          <CheckCircle2 size={12} /> Tandai Lunas
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                          <BadgeCheck size={13} /> Lunas
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!(feeRows ?? []).length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data keuangan</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            <span><b>Belum Diterima</b> — fee belum disetorkan mitra ke RIDE (perlu ditagih)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span><b>Sudah Diterima</b> — fee telah disetorkan dan ditandai lunas oleh admin</span>
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

      {/* Confirm mark-paid dialog */}
      {confirmMitra && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmMitra(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#1a7a6a]/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} className="text-[#1a7a6a]" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Tandai Lunas</h3>
                <p className="text-xs text-gray-500">{confirmMitra.mitraName}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Fee belum diterima</span>
                <span className="font-bold text-red-600">{rupiahFormat(confirmMitra.unpaidFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Jumlah order</span>
                <span className="font-medium text-gray-700">{confirmMitra.unpaidOrders} order</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Konfirmasi bahwa <b>{confirmMitra.mitraName}</b> telah menyetorkan {rupiahFormat(confirmMitra.unpaidFee)} platform fee ke RIDE. Semua {confirmMitra.unpaidOrders} order yang belum lunas akan ditandai sebagai sudah diterima.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmMitra(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                Batal
              </button>
              <button
                onClick={() => markPaidMut.mutate(confirmMitra.mitraId)}
                disabled={markPaidMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#1a7a6a] text-white hover:bg-[#15665a] disabled:opacity-50 transition-colors">
                {markPaidMut.isPending ? "Memproses..." : "Konfirmasi Lunas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
