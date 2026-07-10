import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDate, MITRA_STATUS_COLORS } from "@/lib/api";
import { Search, Eye, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MerchantApplication {
  id: number;
  ownerName: string;
  shopName: string;
  email: string;
  phone: string;
  category: string;
  description: string | null;
  address: string;
  operatingCity: string;
  ktpPath: string | null;
  shopPhotoPath: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

interface MerchantApplicationDetail extends MerchantApplication {
  userId?: number;
  isSuspended?: boolean;
  merchant?: unknown;
}

const STATUS_OPTIONS = [
  { label: "Semua", value: "all" },
  { label: "Menunggu", value: "pending" },
  { label: "Disetujui", value: "approved" },
  { label: "Ditolak", value: "rejected" },
];

const CATEGORY_LABELS: Record<string, string> = {
  food: "Makanan",
  drink: "Minuman",
  grocery: "Toko/Grocery",
  other: "Lainnya",
};

function statusLabel(status: string): string {
  return status === "pending" ? "Menunggu" : status === "approved" ? "Disetujui" : status === "rejected" ? "Ditolak" : status;
}

export default function Warung() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<MerchantApplication | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<{ applications: MerchantApplication[] }>({
    queryKey: ["admin-merchant-applications", status],
    queryFn: () => api.get(`/admin/merchant-applications${status !== "all" ? `?status=${status}` : ""}`),
  });

  const { data: detail } = useQuery<MerchantApplicationDetail>({
    queryKey: ["admin-merchant-application-detail", selected?.email],
    queryFn: () => api.get(`/admin/merchant-applications/${encodeURIComponent(selected!.email)}`),
    enabled: !!selected,
  });

  const statusMut = useMutation({
    mutationFn: ({ email, status }: { email: string; status: string }) =>
      api.patch(`/admin/merchant-applications/${encodeURIComponent(email)}/status`, { status }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-merchant-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-merchant-application-detail"] });
      setFeedback({ type: "success", text: vars.status === "approved" ? "Warung berhasil disetujui." : vars.status === "rejected" ? "Lamaran warung ditolak." : "Status diperbarui." });
      setSelected(null);
    },
    onError: (err: unknown) => {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Terjadi kesalahan" });
    },
  });

  const applications = data?.applications ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(a =>
      a.shopName.toLowerCase().includes(q) ||
      a.ownerName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    );
  }, [applications, search]);

  const activeDetail = detail ?? selected;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Warung</h1>
          <p className="text-sm text-gray-500">Total: {applications.length} lamaran warung</p>
        </div>
      </div>

      {feedback && (
        <div className={cn(
          "rounded-xl px-4 py-3 text-sm flex items-center justify-between",
          feedback.type === "success" ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
        )}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-current/60 hover:text-current text-lg font-light">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama warung / pemilik / email..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
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
                {["Warung & Pemilik", "Email", "No. HP", "Kategori", "Kota", "Status", "Terdaftar", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.shopName}</div>
                    <div className="text-xs text-gray-400">{m.ownerName}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.email}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.phone}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {CATEGORY_LABELS[m.category] ?? m.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.operatingCity}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", MITRA_STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-600")}>
                      {statusLabel(m.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(m.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-[#1a3a5c]" title="Lihat Detail">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Tidak ada data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-bold text-gray-900">{selected.shopName}</h2>
                <p className="text-sm text-gray-500">{selected.ownerName} • {selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Kategori", CATEGORY_LABELS[selected.category] ?? selected.category],
                  ["Kota Operasi", selected.operatingCity],
                  ["No. HP", selected.phone],
                  ["Email", selected.email],
                  ["Alamat", selected.address],
                  ["Terdaftar", formatDate(selected.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                    <p className="font-medium text-gray-800 break-words">{v}</p>
                  </div>
                ))}
              </div>

              {selected.description && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Deskripsi</p>
                  <p className="font-medium text-gray-800">{selected.description}</p>
                </div>
              )}

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Status:</span>
                <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", MITRA_STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-600")}>
                  {statusLabel(selected.status)}
                </span>
              </div>

              {/* Document previews */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Foto KTP</p>
                  {activeDetail?.ktpPath ? (
                    <a href={activeDetail.ktpPath} target="_blank" rel="noreferrer">
                      <img src={activeDetail.ktpPath} alt="Foto KTP" className="w-full h-40 object-cover rounded-lg border border-gray-100" />
                    </a>
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 text-xs">Tidak ada</div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Foto Warung</p>
                  {activeDetail?.shopPhotoPath ? (
                    <a href={activeDetail.shopPhotoPath} target="_blank" rel="noreferrer">
                      <img src={activeDetail.shopPhotoPath} alt="Foto Warung" className="w-full h-40 object-cover rounded-lg border border-gray-100" />
                    </a>
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 text-xs">Tidak ada</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {selected.status === "pending" && (
                  <>
                    <button onClick={() => statusMut.mutate({ email: selected.email, status: "approved" })} disabled={statusMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50">
                      <CheckCircle size={15} /> Setujui
                    </button>
                    <button onClick={() => statusMut.mutate({ email: selected.email, status: "rejected" })} disabled={statusMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
                      <XCircle size={15} /> Tolak
                    </button>
                  </>
                )}
                {selected.status === "rejected" && (
                  <button onClick={() => statusMut.mutate({ email: selected.email, status: "approved" })} disabled={statusMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50">
                    <CheckCircle size={15} /> Setujui
                  </button>
                )}
                {selected.status === "approved" && (
                  <button onClick={() => statusMut.mutate({ email: selected.email, status: "rejected" })} disabled={statusMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
                    <XCircle size={15} /> Tolak
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
