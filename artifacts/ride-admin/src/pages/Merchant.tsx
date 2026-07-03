import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Utensils, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Merchant {
  id: number; name: string; category: string | null; description: string | null;
  address: string | null; lat: number | null; lng: number | null;
  photoPath: string | null; isOpen: boolean; ownerUserId: number | null; createdAt: string;
}

interface MenuItem {
  id: number; merchantId: number; name: string; description: string | null;
  price: number; photoPath: string | null; category: string | null; isAvailable: boolean;
}

function MerchantForm({ initial, onSave, onCancel }: { initial?: Partial<Merchant>; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "food",
    description: initial?.description ?? "",
    address: initial?.address ?? "",
    lat: initial?.lat != null ? String(initial.lat) : "",
    lng: initial?.lng != null ? String(initial.lng) : "",
    photoPath: initial?.photoPath ?? "",
    isOpen: initial?.isOpen ?? true,
  });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{initial?.id ? "Edit Merchant" : "Tambah Merchant"}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Merchant *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Warung Nasi Ibu Sari"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]">
              <option value="food">Makanan</option>
              <option value="drink">Minuman</option>
              <option value="grocery">Toko/Grocery</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
            <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Alamat</label>
            <input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Jl. ..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
              <input type="number" step="any" value={form.lat} onChange={e => set("lat", e.target.value)} placeholder="-6.2088"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
              <input type="number" step="any" value={form.lng} onChange={e => set("lng", e.target.value)} placeholder="106.8456"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Foto (URL)</label>
            <input value={form.photoPath} onChange={e => set("photoPath", e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isOpen} onChange={e => set("isOpen", e.target.checked)} className="w-4 h-4 accent-[#1a7a6a]" />
            Merchant buka (menerima pesanan)
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            <button onClick={() => onSave(form)} className="flex-1 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b]">Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuForm({ initial, onSave, onCancel }: { initial?: Partial<MenuItem>; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial?.price != null ? String(initial.price) : "",
    category: initial?.category ?? "",
    photoPath: initial?.photoPath ?? "",
    isAvailable: initial?.isAvailable ?? true,
  });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{initial?.id ? "Edit Menu" : "Tambah Menu"}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Menu *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nasi Goreng Spesial"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Harga (Rp) *</label>
              <input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="20000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
              <input value={form.category} onChange={e => set("category", e.target.value)} placeholder="Makanan Utama"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
            <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Foto (URL)</label>
            <input value={form.photoPath} onChange={e => set("photoPath", e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isAvailable} onChange={e => set("isAvailable", e.target.checked)} className="w-4 h-4 accent-[#1a7a6a]" />
            Menu tersedia
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            <button onClick={() => onSave(form)} className="flex-1 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b]">Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuManager({ merchant, onBack }: { merchant: Merchant; onBack: () => void }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const { data } = useQuery<{ menu: MenuItem[] }>({
    queryKey: ["admin-menu", merchant.id],
    queryFn: () => api.get(`/admin/merchants/${merchant.id}/menu`),
  });
  const menu = data?.menu ?? [];

  const createMut = useMutation({
    mutationFn: (d: any) => api.post(`/admin/merchants/${merchant.id}/menu`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-menu", merchant.id] }); setShowForm(false); },
  });
  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.patch(`/admin/menu-items/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-menu", merchant.id] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/admin/menu-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-menu", merchant.id] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isAvailable }: { id: number; isAvailable: boolean }) => api.patch(`/admin/menu-items/${id}`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-menu", merchant.id] }),
  });

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1a3a5c]">
        <ChevronLeft size={16} /> Kembali ke daftar merchant
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu — {merchant.name}</h1>
          <p className="text-sm text-gray-500">{menu.length} item menu</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b] transition-colors">
          <Plus size={16} /> Tambah Menu
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {menu.map(m => (
          <div key={m.id} className={cn("bg-white rounded-xl border shadow-sm p-4", m.isAvailable ? "border-gray-100" : "border-gray-200 opacity-60")}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900">{m.name}</p>
                {m.category && <span className="text-xs text-gray-400">{m.category}</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleMut.mutate({ id: m.id, isAvailable: !m.isAvailable })} className="p-1.5 hover:bg-gray-100 rounded text-gray-400" title={m.isAvailable ? "Nonaktifkan" : "Aktifkan"}>
                  {m.isAvailable ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => setEditing(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1a3a5c]"><Edit2 size={14} /></button>
                <button onClick={() => { if (confirm("Hapus menu ini?")) deleteMut.mutate(m.id); }} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-sm font-bold text-[#1a3a5c]">Rp {m.price.toLocaleString("id-ID")}</p>
            {m.description && <p className="text-xs text-gray-400 mt-1">{m.description}</p>}
          </div>
        ))}
        {!menu.length && (
          <div className="col-span-3 py-12 text-center text-gray-400 text-sm">Belum ada menu. Klik "Tambah Menu" untuk mulai.</div>
        )}
      </div>

      {showForm && <MenuForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />}
      {editing && <MenuForm initial={editing} onSave={d => editMut.mutate({ id: editing.id, data: d })} onCancel={() => setEditing(null)} />}
    </div>
  );
}

export default function Merchant() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [managing, setManaging] = useState<Merchant | null>(null);

  const { data } = useQuery<{ merchants: Merchant[] }>({
    queryKey: ["admin-merchants"],
    queryFn: () => api.get("/admin/merchants"),
  });
  const merchants = data?.merchants ?? [];

  const createMut = useMutation({
    mutationFn: (d: any) => api.post("/admin/merchants", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-merchants"] }); setShowForm(false); },
  });
  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.patch(`/admin/merchants/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-merchants"] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/admin/merchants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-merchants"] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isOpen }: { id: number; isOpen: boolean }) => api.patch(`/admin/merchants/${id}`, { isOpen }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-merchants"] }),
  });

  if (managing) {
    return <MenuManager merchant={managing} onBack={() => setManaging(null)} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Merchant & Menu</h1>
          <p className="text-sm text-gray-500">{merchants.length} merchant terdaftar (Ride Makan / Ride Belanja)</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b] transition-colors">
          <Plus size={16} /> Tambah Merchant
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {merchants.map(m => (
          <div key={m.id} className={cn("bg-white rounded-xl border shadow-sm p-4", m.isOpen ? "border-gray-100" : "border-gray-200 opacity-60")}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-gray-900">{m.name}</p>
                <span className="text-xs text-gray-400 capitalize">{m.category ?? "food"}</span>
                {!m.isOpen && <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Tutup</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleMut.mutate({ id: m.id, isOpen: !m.isOpen })} className="p-1.5 hover:bg-gray-100 rounded text-gray-400" title={m.isOpen ? "Tutup" : "Buka"}>
                  {m.isOpen ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => setEditing(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-[#1a3a5c]"><Edit2 size={14} /></button>
                <button onClick={() => { if (confirm("Hapus merchant ini beserta semua menunya?")) deleteMut.mutate(m.id); }} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              {m.description && <p className="text-gray-600">{m.description}</p>}
              {m.address && <p>📍 {m.address}</p>}
            </div>
            <button onClick={() => setManaging(m)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-[#1a7a6a] text-[#1a7a6a] rounded-lg text-sm font-medium hover:bg-[#1a7a6a] hover:text-white transition-colors">
              <Utensils size={14} /> Kelola Menu
            </button>
          </div>
        ))}
        {!merchants.length && (
          <div className="col-span-3 py-12 text-center text-gray-400 text-sm">Belum ada merchant. Klik "Tambah Merchant" untuk mulai.</div>
        )}
      </div>

      {showForm && <MerchantForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />}
      {editing && <MerchantForm initial={editing} onSave={d => editMut.mutate({ id: editing.id, data: d })} onCancel={() => setEditing(null)} />}
    </div>
  );
}
