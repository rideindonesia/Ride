import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDate } from "@/lib/api";
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Voucher {
  id: number; code: string; discountType: string; discountValue: number;
  minOrder: number; maxDiscount: number | null; usageLimit: number | null;
  usageCount: number; expiresAt: string | null; description: string | null;
  isActive: boolean; createdAt: string;
}

function VoucherForm({ initial, onSave, onCancel }: { initial?: Partial<Voucher>; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    discountType: initial?.discountType ?? "percent",
    discountValue: String(initial?.discountValue ?? ""),
    minOrder: String(initial?.minOrder ?? "0"),
    maxDiscount: String(initial?.maxDiscount ?? ""),
    usageLimit: String(initial?.usageLimit ?? ""),
    expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "",
    description: initial?.description ?? "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{initial?.id ? "Edit Voucher" : "Buat Voucher Baru"}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kode Voucher *</label>
            <input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="RIDE10"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe Diskon *</label>
              <select value={form.discountType} onChange={e => set("discountType", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]">
                <option value="percent">Persen (%)</option>
                <option value="fixed">Nominal (Rp)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Diskon *</label>
              <input type="number" value={form.discountValue} onChange={e => set("discountValue", e.target.value)}
                placeholder={form.discountType === "percent" ? "10" : "10000"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min. Order (Rp)</label>
              <input type="number" value={form.minOrder} onChange={e => set("minOrder", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Maks. Diskon (Rp)</label>
              <input type="number" value={form.maxDiscount} onChange={e => set("maxDiscount", e.target.value)} placeholder="Opsional"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Batas Penggunaan</label>
              <input type="number" value={form.usageLimit} onChange={e => set("usageLimit", e.target.value)} placeholder="Tak terbatas"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Berlaku Hingga</label>
              <input type="date" value={form.expiresAt} onChange={e => set("expiresAt", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
            <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            <button onClick={() => onSave(form)} className="flex-1 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b]">Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Voucher() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const qc = useQueryClient();

  const { data: vouchers } = useQuery<Voucher[]>({ queryKey: ["vouchers"], queryFn: () => api.get("/admin/vouchers") });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post("/admin/vouchers", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); setShowForm(false); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.patch(`/admin/vouchers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/admin/vouchers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vouchers"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/admin/vouchers/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vouchers"] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Voucher</h1>
          <p className="text-sm text-gray-500">{vouchers?.length ?? 0} voucher tersedia</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b] transition-colors">
          <Plus size={16} /> Buat Voucher
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(vouchers ?? []).map(v => (
          <div key={v.id} className={cn("bg-white rounded-xl border shadow-sm p-4 transition-all", v.isActive ? "border-gray-100" : "border-gray-200 opacity-60")}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <code className="text-base font-bold text-[#1a3a5c] bg-blue-50 px-2 py-0.5 rounded">{v.code}</code>
                {!v.isActive && <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Nonaktif</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleMut.mutate({ id: v.id, isActive: !v.isActive })} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1a3a5c]" title={v.isActive ? "Nonaktifkan" : "Aktifkan"}>
                  {v.isActive ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => setEditing(v)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1a3a5c]"><Edit2 size={14} /></button>
                <button onClick={() => { if (confirm("Hapus voucher ini?")) deleteMut.mutate(v.id); }} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <p className="text-sm font-semibold text-gray-800">
                {v.discountType === "percent" ? `${v.discountValue}% off` : `Rp ${v.discountValue.toLocaleString("id-ID")} off`}
              </p>
              {v.minOrder > 0 && <p>Min. order: Rp {v.minOrder.toLocaleString("id-ID")}</p>}
              {v.maxDiscount && <p>Maks. diskon: Rp {v.maxDiscount.toLocaleString("id-ID")}</p>}
              <p>Dipakai: {v.usageCount}/{v.usageLimit ?? "∞"}</p>
              {v.expiresAt && <p>Berlaku hingga: {formatDate(v.expiresAt)}</p>}
              {v.description && <p className="text-gray-400 italic">{v.description}</p>}
            </div>
          </div>
        ))}
        {!(vouchers ?? []).length && (
          <div className="col-span-3 py-12 text-center text-gray-400 text-sm">Belum ada voucher. Klik "Buat Voucher" untuk mulai.</div>
        )}
      </div>

      {showForm && <VoucherForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />}
      {editing && <VoucherForm initial={editing} onSave={d => editMut.mutate({ id: editing.id, data: d })} onCancel={() => setEditing(null)} />}
    </div>
  );
}
