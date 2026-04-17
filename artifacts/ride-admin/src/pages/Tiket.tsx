import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MessageSquare, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface Report {
  id: number;
  title: string;
  type: string;
  message: string;
  status: string;
  createdAt: string;
  userId: number;
  orderId: number | null;
  orderNo: string | null;
  adminNote: string | null;
  userName: string;
  userEmail: string;
  userPhone: string | null;
}

interface ReportResponse {
  rows: Report[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Menunggu", color: "#dc2626", bg: "#fef2f2" },
  in_progress: { label: "Diproses", color: "#d97706", bg: "#fffbeb" },
  resolved: { label: "Selesai", color: "#16a34a", bg: "#f0fdf4" },
};

const TYPE_LABELS: Record<string, string> = {
  order: "Masalah Order",
  payment: "Pembayaran",
  mitra: "Mitra",
  app: "Aplikasi",
  general: "Umum",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Tiket() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery<ReportResponse>({
    queryKey: ["admin-reports", filterStatus, page],
    queryFn: () => api.get(`/admin/reports?status=${filterStatus}&page=${page}&limit=20`),
    refetchInterval: 30000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) =>
      api.patch(`/admin/reports/${id}/status`, { status, adminNote }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reports"] }); setUpdatingId(null); },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tiket Laporan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Laporan masuk dari pengguna aplikasi RIDE</p>
      </div>

      {/* Filter status */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { v: "all", l: "Semua" },
          { v: "open", l: "Menunggu" },
          { v: "in_progress", l: "Diproses" },
          { v: "resolved", l: "Selesai" },
        ].map(f => (
          <button
            key={f.v}
            onClick={() => { setFilterStatus(f.v); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filterStatus === f.v
                ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#1a3a5c]"
            }`}
          >
            {f.l}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-sm text-gray-400">{data.total} tiket</span>
        )}
      </div>

      {/* Tiket list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Memuat tiket...</span>
          </div>
        ) : (data?.rows?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <MessageSquare size={36} className="mb-3 opacity-30" />
            <p className="text-sm">Tidak ada tiket{filterStatus !== "all" ? " dengan status ini" : ""}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data!.rows.map(r => {
              const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.open;
              const isOpen = expanded === r.id;
              const noteVal = adminNotes[r.id] ?? (r.adminNote ?? "");
              return (
                <div key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <button
                    className="w-full text-left px-5 py-4 flex items-start gap-3"
                    onClick={() => {
                      setExpanded(isOpen ? null : r.id);
                      if (!isOpen && r.adminNote) {
                        setAdminNotes(prev => ({ ...prev, [r.id]: r.adminNote ?? "" }));
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-800 truncate">{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium`} style={{ color: st.color, background: st.bg }}>
                          {st.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {TYPE_LABELS[r.type] ?? r.type}
                        </span>
                        {r.orderNo && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-mono font-medium">
                            #{r.orderNo}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{r.userName} · {r.userEmail}{r.userPhone ? ` · ${r.userPhone}` : ""}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.createdAt)}</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400 mt-1 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 mt-1 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-50 bg-gray-50/30 space-y-4">
                      <p className="text-sm text-gray-700 mt-3 leading-relaxed whitespace-pre-wrap">{r.message}</p>

                      {/* Catatan admin */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Catatan Admin (opsional)</label>
                        <textarea
                          value={noteVal}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Tulis catatan untuk tiket ini..."
                          rows={2}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a3a5c] resize-none text-gray-700 bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-500 mr-1">Ubah status:</span>
                        {[
                          { v: "open", l: "Menunggu" },
                          { v: "in_progress", l: "Diproses" },
                          { v: "resolved", l: "Selesai" },
                        ].map(s => {
                          const ss = STATUS_LABELS[s.v];
                          return (
                            <button
                              key={s.v}
                              disabled={r.status === s.v || updatingId === r.id}
                              onClick={() => {
                                setUpdatingId(r.id);
                                updateMut.mutate({ id: r.id, status: s.v, adminNote: noteVal });
                              }}
                              className="px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-40"
                              style={{
                                color: r.status === s.v ? ss.color : "#6b7280",
                                background: r.status === s.v ? ss.bg : "#fff",
                                borderColor: r.status === s.v ? ss.color : "#e5e7eb",
                              }}
                            >
                              {updatingId === r.id && r.status !== s.v ? <Loader2 size={10} className="inline animate-spin mr-1" /> : null}
                              {s.l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-[#1a3a5c] disabled:opacity-40 transition-colors">
            ← Sebelumnya
          </button>
          <span className="text-sm text-gray-500">Hal. {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-[#1a3a5c] disabled:opacity-40 transition-colors">
            Berikutnya →
          </button>
        </div>
      )}
    </div>
  );
}
