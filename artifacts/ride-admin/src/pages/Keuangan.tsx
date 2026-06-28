import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, rupiahFormat } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Wallet, TrendingUp, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, BadgeCheck, Download, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function exportToCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => {
    const v = r[h] ?? "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  }).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

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

interface FeePayment {
  id: number; mitraId: number; mitraName: string; mitraEmail: string;
  amountClaimed: number; amountVerified: number | null;
  proofPhotoPath: string; status: string; notes: string | null;
  createdAt: string; verifiedAt: string | null;
}

export default function Keuangan() {
  const [page, setPage] = useState(1);
  const [confirmMitra, setConfirmMitra] = useState<FeePerMitra | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<"pending" | "all">("pending");
  const [verifyPayment, setVerifyPayment] = useState<FeePayment | null>(null);
  const [verifyAmount, setVerifyAmount] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [rejectPayment, setRejectPayment] = useState<FeePayment | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
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

  const { data: feePayments } = useQuery<FeePayment[]>({
    queryKey: ["fee-payments", paymentFilter],
    queryFn: () => api.get(`/admin/keuangan/fee-payments?status=${paymentFilter === "pending" ? "pending" : "all"}`),
    refetchInterval: 30000,
  });

  const verifyMut = useMutation({
    mutationFn: ({ id, amountVerified, notes }: { id: number; amountVerified: string; notes: string }) =>
      api.patch(`/admin/keuangan/fee-payments/${id}/verify`, { amountVerified, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-payments"] });
      qc.invalidateQueries({ queryKey: ["keuangan-summary"] });
      setVerifyPayment(null);
      setVerifyAmount("");
      setVerifyNotes("");
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      api.patch(`/admin/keuangan/fee-payments/${id}/reject`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-payments"] });
      setRejectPayment(null);
      setRejectNotes("");
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
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800">Platform Fee per Mitra</h3>
            <p className="text-xs text-gray-400 mt-0.5">Diurutkan dari fee terbesar • Tandai lunas setelah mitra menyetor ke RIDE</p>
          </div>
          <button
            onClick={() => {
              if (!feeRows?.length) return;
              const mapped = feeRows.map(r => ({
                "Nama Mitra": r.mitraName,
                "Email": r.mitraEmail,
                "Total Order": r.totalOrders,
                "Total Fee (Rp)": r.totalFee,
                "Belum Diterima (Rp)": r.unpaidFee,
                "Sudah Diterima (Rp)": r.totalFee - r.unpaidFee,
              }));
              exportToCSV(mapped, `RIDE_Keuangan_${new Date().toISOString().slice(0,10)}.csv`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a7a6a] text-white text-xs font-semibold hover:bg-[#156a5a] transition-colors shrink-0"
          >
            <Download size={13} />
            Export CSV
          </button>
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

      {/* ── Bukti Pembayaran Mitra ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800">📤 Bukti Pembayaran dari Mitra</h3>
            <p className="text-xs text-gray-400 mt-0.5">Verifikasi setoran platform fee yang dikirim mitra</p>
          </div>
          <div className="flex gap-2">
            {(["pending", "all"] as const).map(f => (
              <button key={f} onClick={() => setPaymentFilter(f)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  paymentFilter === f ? "bg-[#1a7a6a] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                {f === "pending" ? "⏳ Menunggu" : "Semua"}
                {f === "pending" && feePayments?.filter(p => p.status === "pending").length
                  ? ` (${feePayments.filter(p => p.status === "pending").length})`
                  : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {(feePayments ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              {paymentFilter === "pending" ? "Tidak ada bukti pembayaran yang menunggu verifikasi" : "Belum ada pengajuan pembayaran"}
            </div>
          ) : (feePayments ?? []).map(p => {
            const isPending = p.status === "pending";
            const isVerified = p.status === "verified";
            const dt = new Date(p.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
            return (
              <div key={p.id} className={cn("px-5 py-4 flex gap-4 items-start", isPending && "bg-amber-50/40")}>
                {/* Proof photo thumbnail */}
                <button onClick={() => setPreviewPhoto(p.proofPhotoPath)} className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-80 transition-opacity">
                  <img src={`/api${p.proofPhotoPath}`} alt="bukti" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </button>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{p.mitraName}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold",
                      isPending ? "bg-amber-100 text-amber-700" : isVerified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {isPending ? "⏳ Menunggu" : isVerified ? "✅ Verified" : "❌ Ditolak"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">{p.mitraEmail} · {dt}</div>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-gray-400 text-xs">Diklaim: </span>
                      <span className="font-bold text-gray-800">{rupiahFormat(p.amountClaimed)}</span>
                    </div>
                    {p.amountVerified && (
                      <div>
                        <span className="text-gray-400 text-xs">Diverif: </span>
                        <span className="font-bold text-green-600">{rupiahFormat(p.amountVerified)}</span>
                      </div>
                    )}
                  </div>
                  {p.notes && <p className="text-xs text-gray-500 mt-1 italic">"{p.notes}"</p>}
                </div>
                {/* Actions */}
                {isPending && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setVerifyPayment(p); setVerifyAmount(String(p.amountClaimed)); setVerifyNotes(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a7a6a] text-white rounded-lg text-xs font-semibold hover:bg-[#15665a] transition-colors whitespace-nowrap">
                      <CheckCircle2 size={12} /> Verifikasi
                    </button>
                    <button
                      onClick={() => { setRejectPayment(p); setRejectNotes(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors whitespace-nowrap">
                      <X size={12} /> Tolak
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verify dialog */}
      {verifyPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVerifyPayment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Verifikasi Pembayaran</h3>
              <button onClick={() => setVerifyPayment(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Mitra</span>
                <span className="font-medium text-gray-800">{verifyPayment.mitraName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Diklaim</span>
                <span className="font-bold text-gray-800">{rupiahFormat(verifyPayment.amountClaimed)}</span>
              </div>
            </div>
            {/* Proof photo */}
            <div className="mb-4 rounded-xl overflow-hidden border border-gray-200 max-h-40">
              <img src={`/api${verifyPayment.proofPhotoPath}`} alt="bukti" className="w-full object-cover" />
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1.5">Jumlah yang diverifikasi (Rp)</label>
              <input type="number" value={verifyAmount} onChange={e => setVerifyAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]/30" />
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">Catatan (opsional)</label>
              <input type="text" value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)} placeholder="Misal: Sudah masuk rekening"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]/30" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setVerifyPayment(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={() => verifyMut.mutate({ id: verifyPayment.id, amountVerified: verifyAmount, notes: verifyNotes })}
                disabled={verifyMut.isPending || !verifyAmount}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#1a7a6a] text-white hover:bg-[#15665a] disabled:opacity-50 transition-colors">
                {verifyMut.isPending ? "Memproses..." : "✅ Verifikasi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejectPayment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Tolak Pengajuan</h3>
              <button onClick={() => setRejectPayment(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Tolak bukti pembayaran dari <b>{rejectPayment.mitraName}</b> sebesar {rupiahFormat(rejectPayment.amountClaimed)}?
            </p>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">Alasan penolakan</label>
              <input type="text" value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Misal: Foto tidak jelas, nominal tidak sesuai"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRejectPayment(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={() => rejectMut.mutate({ id: rejectPayment.id, notes: rejectNotes })}
                disabled={rejectMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                {rejectMut.isPending ? "Memproses..." : "❌ Tolak Pengajuan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo preview overlay */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-lg w-full">
            <img src={`/api${previewPhoto}`} alt="bukti pembayaran" className="w-full rounded-2xl shadow-2xl" />
            <button onClick={() => setPreviewPhoto(null)} className="absolute top-3 right-3 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
