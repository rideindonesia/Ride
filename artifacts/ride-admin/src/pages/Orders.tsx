import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDatetime, rupiahFormat, SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Search, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: number; orderNo: string; serviceType: string; status: string;
  totalAmount: number; platformFee: number; pickupAddress: string;
  createdAt: string; penggunaId: number; mitraId: number | null;
  penggunaName: string; mitraName: string;
}

const STATUS_OPTIONS = ["all", "pending", "accepted", "in_progress", "done", "cancelled"];
const SERVICE_OPTIONS = ["all", "bengkel", "barber", "cuci", "elektronik", "inspeksi", "towing"];

export default function Orders() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [serviceType, setServiceType] = useState("all");
  const [selected, setSelected] = useState<OrderItem | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<{ data: OrderItem[]; total: number }>({
    queryKey: ["admin-orders", page, status, serviceType],
    queryFn: () => api.get(`/admin/orders?page=${page}&limit=20&status=${status}&serviceType=${serviceType}`),
    refetchInterval: 15000,
  });

  const { data: detail } = useQuery<any>({
    queryKey: ["admin-order-detail", selected?.id],
    queryFn: () => api.get(`/admin/orders/${selected!.id}`),
    enabled: !!selected,
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/orders/${id}/cancel`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-orders"] }); setSelected(null); },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Order</h1>
          <p className="text-sm text-gray-500">Total: {data?.total ?? "–"} order • Refresh otomatis 15 detik</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Live
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                  className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                    status === s ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-200 hover:border-[#1a3a5c]")}>
                  {s === "all" ? "Semua" : STATUS_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Layanan</p>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_OPTIONS.map(s => (
                <button key={s} onClick={() => { setServiceType(s); setPage(1); }}
                  className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                    serviceType === s ? "bg-[#1a7a6a] text-white border-[#1a7a6a]" : "bg-white text-gray-600 border-gray-200 hover:border-[#1a7a6a]")}>
                  {s === "all" ? "Semua" : SERVICE_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Order No", "Layanan", "Pengguna", "Mitra", "Status", "Total", "Platform Fee", "Waktu", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{o.orderNo}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{SERVICE_LABELS[o.serviceType] ?? o.serviceType}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.penggunaName}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.mitraName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-600")}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{rupiahFormat(o.totalAmount ?? 0)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{rupiahFormat(o.platformFee ?? 0)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDatetime(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(o)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-[#1a3a5c]">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.data?.length && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Tidak ada order</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-bold text-gray-900 font-mono text-sm">{selected.orderNo}</h2>
                <p className="text-xs text-gray-500">{SERVICE_LABELS[selected.serviceType]} • {formatDatetime(selected.createdAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold", STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-600")}>
                {STATUS_LABELS[selected.status] ?? selected.status}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Pengguna", detail?.pengguna?.name ?? selected.penggunaName],
                  ["Mitra", detail?.mitra?.name ?? selected.mitraName],
                  ["Total", rupiahFormat(selected.totalAmount ?? 0)],
                  ["Platform Fee", rupiahFormat(selected.platformFee ?? 0)],
                  ["Alamat", selected.pickupAddress],
                ].map(([k, v]) => (
                  <div key={k} className={cn("bg-gray-50 rounded-lg p-3", k === "Alamat" ? "col-span-2" : "")}>
                    <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                    <p className="font-medium text-gray-800 text-sm break-words">{v}</p>
                  </div>
                ))}
              </div>
              {(selected.status === "pending" || selected.status === "accepted") && (
                <button onClick={() => cancelMut.mutate(selected.id)}
                  className="w-full py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                  Batalkan Order
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
