import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDate, rupiahFormat } from "@/lib/api";
import { Search, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PenggunaItem {
  id: number; name: string; email: string; phone: string;
  isSuspended: boolean; createdAt: string; totalOrders: number;
}

export default function Pengguna() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<PenggunaItem | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<{ data: PenggunaItem[]; total: number }>({
    queryKey: ["admin-pengguna", page, search],
    queryFn: () => api.get(`/admin/pengguna?page=${page}&limit=20&search=${encodeURIComponent(search)}`),
  });

  const { data: detail } = useQuery<any>({
    queryKey: ["admin-pengguna-detail", selected?.id],
    queryFn: () => api.get(`/admin/pengguna/${selected!.id}`),
    enabled: !!selected,
  });

  const suspendMut = useMutation({
    mutationFn: ({ id, suspended }: { id: number; suspended: boolean }) =>
      api.patch(`/admin/pengguna/${id}/suspend`, { suspended }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pengguna"] }); qc.invalidateQueries({ queryKey: ["admin-pengguna-detail"] }); },
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>
        <p className="text-sm text-gray-500">Total: {data?.total ?? "–"} pengguna terdaftar</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            placeholder="Cari nama / email... (Enter)"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Nama & Email", "Telepon", "Status", "Total Order", "Terdaftar", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.phone || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", u.isSuspended ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                      {u.isSuspended ? "Disuspend" : "Aktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.totalOrders}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(u)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-[#1a3a5c]" title="Detail">
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
                <h2 className="font-bold text-gray-900">{selected.name}</h2>
                <p className="text-sm text-gray-500">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Telepon", selected.phone || "-"],
                  ["Status", selected.isSuspended ? "Disuspend" : "Aktif"],
                  ["Total Order", String(selected.totalOrders)],
                  ["Terdaftar", formatDate(selected.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                    <p className="font-medium text-gray-800">{v}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => suspendMut.mutate({ id: selected.id, suspended: !selected.isSuspended })}
                className={cn("w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  selected.isSuspended ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600")}>
                {selected.isSuspended ? "Aktifkan Akun" : "Suspend Akun"}
              </button>

              {detail?.orders && detail.orders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Terbaru</h3>
                  <div className="space-y-1.5">
                    {detail.orders.slice(0, 5).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                        <span className="font-mono text-gray-600">{o.orderNo}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{rupiahFormat(o.totalAmount ?? 0)}</span>
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
