import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDate, SERVICE_LABELS, MITRA_STATUS_COLORS } from "@/lib/api";
import { Search, Eye, CheckCircle, XCircle, PauseCircle, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface MitraItem {
  id: number; name: string; email: string; phone: string; serviceType: string;
  operatingCity: string; status: string; createdAt: string; totalOrders: number;
}

interface MitraDetail extends MitraItem {
  userId: number; isSuspended: boolean;
  orders: { id: number; orderNo: string; serviceType: string; status: string; totalAmount: number; platformFee: number; createdAt: string }[];
  platformFeeTotal: number;
  vehicleBrands?: string; operatingArea?: string; bankName?: string; bankAccount?: string; bankAccountName?: string;
  ktpUrl?: string; stnkUrl?: string; photoUrl?: string;
}

const STATUS_OPTIONS = [
  { label: "Semua", value: "all" },
  { label: "Menunggu", value: "pending" },
  { label: "Disetujui", value: "approved" },
  { label: "Ditolak", value: "rejected" },
];

export default function Mitra() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<MitraItem | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<{ data: MitraItem[]; total: number; page: number; limit: number }>({
    queryKey: ["admin-mitra", page, search, status],
    queryFn: () => api.get(`/admin/mitra?page=${page}&limit=20&status=${status}&search=${encodeURIComponent(search)}`),
  });

  const { data: detail } = useQuery<MitraDetail>({
    queryKey: ["admin-mitra-detail", selected?.email],
    queryFn: () => api.get(`/admin/mitra/${encodeURIComponent(selected!.email)}`),
    enabled: !!selected,
  });

  const statusMut = useMutation({
    mutationFn: ({ email, status }: { email: string; status: string }) =>
      api.patch(`/admin/mitra/${encodeURIComponent(email)}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mitra"] }); qc.invalidateQueries({ queryKey: ["admin-mitra-detail"] }); },
  });

  const suspendMut = useMutation({
    mutationFn: ({ email, suspended }: { email: string; suspended: boolean }) =>
      api.patch(`/admin/mitra/${encodeURIComponent(email)}/suspend`, { suspended }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mitra"] }); qc.invalidateQueries({ queryKey: ["admin-mitra-detail"] }); },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Mitra</h1>
          <p className="text-sm text-gray-500">Total: {data?.total ?? "–"} mitra</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            placeholder="Cari nama / email... (Enter)"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => { setStatus(s.value); setPage(1); }}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                status === s.value ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-200 hover:border-[#1a3a5c]")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Nama & Email", "Layanan", "Kota", "Status", "Order", "Terdaftar", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400">{m.email}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {SERVICE_LABELS[m.serviceType] ?? m.serviceType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.operatingCity}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", MITRA_STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-600")}>
                      {m.status === "pending" ? "Menunggu" : m.status === "approved" ? "Disetujui" : m.status === "rejected" ? "Ditolak" : m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.totalOrders}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(m.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-[#1a3a5c]" title="Lihat Detail">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.data?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Tidak ada data</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">Halaman {page} dari {totalPages} • {data?.total ?? 0} total</p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-bold text-gray-900">{selected.name}</h2>
                <p className="text-sm text-gray-500">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Layanan", SERVICE_LABELS[selected.serviceType] ?? selected.serviceType],
                  ["Kota", selected.operatingCity],
                  ["Telepon", selected.phone],
                  ["Total Order", String(selected.totalOrders)],
                  ["Platform Fee", `Rp ${(detail?.platformFeeTotal ?? 0).toLocaleString("id-ID")}`],
                  ["Terdaftar", formatDate(selected.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                    <p className="font-medium text-gray-800">{v}</p>
                  </div>
                ))}
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Status:</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", MITRA_STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-600")}>
                  {selected.status === "pending" ? "Menunggu" : selected.status === "approved" ? "Disetujui" : selected.status === "rejected" ? "Ditolak" : selected.status}
                </span>
                {detail?.isSuspended && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Disuspend</span>}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {selected.status === "pending" && (
                  <>
                    <button onClick={() => statusMut.mutate({ email: selected.email, status: "approved" })}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors">
                      <CheckCircle size={15} /> Setujui
                    </button>
                    <button onClick={() => statusMut.mutate({ email: selected.email, status: "rejected" })}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                      <XCircle size={15} /> Tolak
                    </button>
                  </>
                )}
                {selected.status === "approved" && (
                  <button onClick={() => suspendMut.mutate({ email: selected.email, suspended: !detail?.isSuspended })}
                    className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      detail?.isSuspended ? "bg-green-500 text-white hover:bg-green-600" : "bg-yellow-500 text-white hover:bg-yellow-600")}>
                    <PauseCircle size={15} /> {detail?.isSuspended ? "Aktifkan" : "Suspend"}
                  </button>
                )}
                {selected.status === "rejected" && (
                  <button onClick={() => statusMut.mutate({ email: selected.email, status: "pending" })}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
                    Reset ke Menunggu
                  </button>
                )}
              </div>

              {/* Recent orders */}
              {detail?.orders && detail.orders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Terbaru</h3>
                  <div className="space-y-1.5">
                    {detail.orders.slice(0, 5).map(o => (
                      <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                        <div><span className="font-mono text-gray-600">{o.orderNo}</span> — {SERVICE_LABELS[o.serviceType] ?? o.serviceType}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{formatDate(o.createdAt)}</span>
                          <span className={cn("px-2 py-0.5 rounded-full font-medium", o.status === "done" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>
                            {o.status === "done" ? "Selesai" : o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
