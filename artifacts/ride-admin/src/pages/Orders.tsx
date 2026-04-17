import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDatetime, rupiahFormat, SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Search, Eye, ChevronLeft, ChevronRight, Star, MapPin, Car, Phone, Mail, CreditCard, Wrench, MessageSquare, Clock, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: number; orderNo: string; serviceType: string; status: string;
  totalAmount: number; platformFee: number; pickupAddress: string;
  createdAt: string; penggunaId: number; mitraId: number | null;
  penggunaName: string; mitraName: string;
}

interface OrderDetail extends OrderItem {
  vehicleType: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  damageCategories: string[] | null;
  description: string | null;
  detailAlamat: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  trackingPhase: string | null;
  penggunaConfirmed: boolean;
  paymentData: {
    biayaJasa: number;
    biayaSparepart: number;
    biayaPanggilan: number;
    biayaLayanan: number;
    total: number;
    paymentMethod: string;
  } | null;
  rating: number | null;
  reviewComment: string | null;
  updatedAt: string;
  pengguna: { id: number; name: string; email: string; phone: string | null; walletBalance: number } | null;
  mitra: { id: number; name: string; email: string; phone: string | null; serviceType: string; operatingCity: string; mitraStatus: string } | null;
}

const STATUS_OPTIONS = ["all", "pending", "accepted", "in_progress", "done", "cancelled"];
const SERVICE_OPTIONS = ["all", "bengkel", "barber", "cuci", "elektronik", "inspeksi", "towing"];

const TRACKING_LABELS: Record<string, string> = {
  menuju: "Menuju Lokasi",
  tiba: "Tiba di Lokasi",
  mulai: "Sedang Mengerjakan",
  selesai: "Pekerjaan Selesai",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wallet: "RIDE Wallet",
  cash: "Tunai",
  transfer: "Transfer Bank",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={16}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"}
        />
      ))}
      <span className="ml-1 text-sm font-bold text-amber-600">{rating.toFixed(1)}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        <Icon size={14} className="text-[#1a7a6a]" />
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 min-w-[110px]">{label}</span>
      <span className={cn("text-xs font-medium text-gray-800 text-right break-words", mono && "font-mono")}>{value ?? "–"}</span>
    </div>
  );
}

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

  const { data: detail, isLoading: detailLoading } = useQuery<OrderDetail>({
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
                {["Order No", "Layanan", "Pengguna", "Mitra", "Status", "Total", "Platform Fee", "Rating", "Waktu", "Aksi"].map(h => (
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(o as any).rating != null ? (
                      <div className="flex items-center gap-0.5">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-600">{Number((o as any).rating).toFixed(1)}</span>
                      </div>
                    ) : <span className="text-xs text-gray-300">–</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDatetime(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(o)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-[#1a3a5c]">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.data?.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-sm">Tidak ada order</td></tr>
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="font-bold text-gray-900 font-mono text-sm">{selected.orderNo}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{SERVICE_LABELS[selected.serviceType]} • {formatDatetime(selected.createdAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light leading-none mt-0.5">×</button>
            </div>

            <div className="p-6 space-y-5">
              {detailLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm animate-pulse">Memuat detail...</div>
              ) : (
                <>
                  {/* Status + Rating Row */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold", STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-600")}>
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </span>
                    {detail?.rating != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <StarRating rating={detail.rating} />
                        {detail.reviewComment && (
                          <p className="text-xs text-gray-500 italic text-right max-w-[200px]">"{detail.reviewComment}"</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Belum ada rating</span>
                    )}
                  </div>

                  {/* Pengguna */}
                  <Section icon={User} title="Pengguna">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <InfoRow label="Nama" value={detail?.pengguna?.name ?? selected.penggunaName} />
                      <InfoRow label="Email" value={detail?.pengguna?.email} />
                      <InfoRow label="No. HP" value={detail?.pengguna?.phone} />
                      <InfoRow label="Saldo Wallet" value={detail?.pengguna?.walletBalance != null ? rupiahFormat(detail.pengguna.walletBalance) : "–"} />
                    </div>
                  </Section>

                  {/* Mitra */}
                  <Section icon={Shield} title="Mitra">
                    {detail?.mitra ? (
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        <InfoRow label="Nama" value={detail.mitra.name} />
                        <InfoRow label="Email" value={detail.mitra.email} />
                        <InfoRow label="No. HP" value={detail.mitra.phone} />
                        <InfoRow label="Layanan" value={SERVICE_LABELS[detail.mitra.serviceType] ?? detail.mitra.serviceType} />
                        <InfoRow label="Kota Operasi" value={detail.mitra.operatingCity} />
                        <InfoRow label="Status Mitra" value={
                          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                            detail.mitra.mitraStatus === "approved" ? "bg-green-100 text-green-700" :
                            detail.mitra.mitraStatus === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700")}>
                            {detail.mitra.mitraStatus}
                          </span>
                        } />
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-400">Belum ada mitra yang menerima</div>
                    )}
                  </Section>

                  {/* Lokasi */}
                  <Section icon={MapPin} title="Lokasi Penjemputan">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <InfoRow label="Alamat" value={detail?.pickupAddress ?? selected.pickupAddress} />
                      {detail?.detailAlamat && <InfoRow label="Detail Alamat" value={detail.detailAlamat} />}
                      {detail?.pickupLat && detail?.pickupLng && (
                        <InfoRow label="Koordinat" value={`${detail.pickupLat.toFixed(6)}, ${detail.pickupLng.toFixed(6)}`} mono />
                      )}
                    </div>
                  </Section>

                  {/* Info Kendaraan (jika ada) */}
                  {(detail?.vehicleType || detail?.vehicleModel) && (
                    <Section icon={Car} title="Informasi Kendaraan">
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        {detail.vehicleType && <InfoRow label="Jenis Kendaraan" value={detail.vehicleType} />}
                        {detail.vehicleModel && <InfoRow label="Model" value={detail.vehicleModel} />}
                        {detail.vehicleYear && <InfoRow label="Tahun" value={detail.vehicleYear} />}
                        {detail.damageCategories && detail.damageCategories.length > 0 && (
                          <InfoRow label="Kategori Masalah" value={detail.damageCategories.join(", ")} />
                        )}
                        {detail.description && <InfoRow label="Deskripsi" value={detail.description} />}
                      </div>
                    </Section>
                  )}

                  {/* Fase Tracking */}
                  {detail?.trackingPhase && (
                    <Section icon={Clock} title="Fase Pengerjaan">
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        <InfoRow label="Fase Saat Ini" value={TRACKING_LABELS[detail.trackingPhase] ?? detail.trackingPhase} />
                        <InfoRow label="Dikonfirmasi Pengguna" value={detail.penggunaConfirmed ? "Ya ✓" : "Belum"} />
                        <InfoRow label="Terakhir Diperbarui" value={formatDatetime(detail.updatedAt)} />
                      </div>
                    </Section>
                  )}

                  {/* Rincian Pembayaran */}
                  <Section icon={CreditCard} title="Rincian Pembayaran">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      {detail?.paymentData ? (
                        <>
                          <InfoRow label="Biaya Panggilan" value={rupiahFormat(detail.paymentData.biayaPanggilan)} />
                          <InfoRow label="Biaya Jasa" value={rupiahFormat(detail.paymentData.biayaJasa)} />
                          {detail.paymentData.biayaSparepart > 0 && (
                            <InfoRow label="Biaya Sparepart" value={rupiahFormat(detail.paymentData.biayaSparepart)} />
                          )}
                          <InfoRow label="Biaya Layanan Admin" value={rupiahFormat(detail.paymentData.biayaLayanan)} />
                          <div className="border-t border-gray-200 mt-1.5 pt-1.5">
                            <InfoRow label="Total Dibayar" value={<span className="font-bold text-[#1a3a5c]">{rupiahFormat(detail.paymentData.total)}</span>} />
                            <InfoRow label="Metode Pembayaran" value={PAYMENT_METHOD_LABELS[detail.paymentData.paymentMethod] ?? detail.paymentData.paymentMethod} />
                          </div>
                        </>
                      ) : (
                        <>
                          <InfoRow label="Total" value={<span className="font-bold text-[#1a3a5c]">{rupiahFormat(selected.totalAmount ?? 0)}</span>} />
                          <InfoRow label="Platform Fee" value={rupiahFormat(selected.platformFee ?? 0)} />
                          <p className="text-xs text-gray-400 pt-1 italic">Rincian pembayaran belum tersedia</p>
                        </>
                      )}
                    </div>
                  </Section>

                  {/* Platform Fee Box */}
                  <div className="rounded-lg bg-[#1a3a5c]/5 border border-[#1a3a5c]/10 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#1a3a5c]/70 font-medium">Platform Fee (Pendapatan RIDE)</p>
                      <p className="text-lg font-bold text-[#1a3a5c]">{rupiahFormat(detail?.platformFee ?? selected.platformFee ?? 0)}</p>
                    </div>
                    <Wrench size={24} className="text-[#1a3a5c]/20" />
                  </div>

                  {/* Review */}
                  {detail?.reviewComment && (
                    <Section icon={MessageSquare} title="Ulasan Pengguna">
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                        {detail.rating != null && (
                          <div className="mb-2"><StarRating rating={detail.rating} /></div>
                        )}
                        <p className="text-sm text-gray-700 italic">"{detail.reviewComment}"</p>
                      </div>
                    </Section>
                  )}

                  {/* Cancel button */}
                  {(selected.status === "pending" || selected.status === "accepted") && (
                    <button onClick={() => cancelMut.mutate(selected.id)} disabled={cancelMut.isPending}
                      className="w-full py-2.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50">
                      {cancelMut.isPending ? "Membatalkan..." : "Batalkan Order Ini"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
