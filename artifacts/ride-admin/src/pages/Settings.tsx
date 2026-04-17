import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Save, Loader2, Plus, RefreshCw } from "lucide-react";

interface SettingEntry { value: string; label: string }
type SettingsMap = Record<string, SettingEntry>;

const SETTING_GROUPS = [
  {
    label: "Biaya Panggilan per Layanan",
    keys: [
      "call_fee_bengkel_base", "call_fee_bengkel_per_km",
      "call_fee_barber_base", "call_fee_barber_per_km",
      "call_fee_cuci_base", "call_fee_cuci_per_km",
      "call_fee_elektronik_base", "call_fee_elektronik_per_km",
      "call_fee_inspeksi_base", "call_fee_inspeksi_per_km",
      "call_fee_towing_base", "call_fee_towing_per_km",
    ],
  },
  {
    label: "Biaya & Fee Platform",
    keys: ["call_fee_free_km", "biaya_layanan_admin", "platform_fee_pct"],
  },
];

export default function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery<SettingsMap>({ queryKey: ["settings"], queryFn: () => api.get("/admin/settings") });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const saveMut = useMutation({
    mutationFn: (data: Record<string, string>) => api.patch("/admin/settings", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });
  const [adminSaved, setAdminSaved] = useState("");
  const createAdminMut = useMutation({
    mutationFn: (data: any) => api.post("/admin/accounts", data),
    onSuccess: (u: any) => { setAdminSaved(`Admin ${u.name} berhasil dibuat`); setAdminForm({ name: "", email: "", password: "" }); },
  });

  const { data: adminList } = useQuery<any[]>({ queryKey: ["admin-accounts"], queryFn: () => api.get("/admin/accounts") });

  // Seed admin shortcut
  const seedMut = useMutation({
    mutationFn: () => api.post("/seed/admin", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-accounts"] }); },
  });

  const getValue = (key: string) => edits[key] ?? settings?.[key]?.value ?? "";
  const set = (key: string, val: string) => setEdits(e => ({ ...e, [key]: val }));

  const handleSave = () => {
    if (Object.keys(edits).length === 0) return;
    saveMut.mutate(edits);
    setEdits({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <p className="text-sm text-gray-500">Kelola tarif layanan dan konfigurasi platform</p>
        </div>
        <button
          onClick={handleSave}
          disabled={Object.keys(edits).length === 0 || saveMut.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a7a6a] text-white rounded-lg text-sm font-medium hover:bg-[#15695b] disabled:opacity-50 transition-colors"
        >
          {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? "Tersimpan!" : "Simpan Perubahan"}
        </button>
      </div>

      {/* Setting Groups */}
      {SETTING_GROUPS.map(group => (
        <div key={group.label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-800 text-sm">{group.label}</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {group.keys.filter(k => settings?.[k]).map(key => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{settings?.[key]?.label ?? key}</label>
                  <div className="relative">
                    <input
                      type="number" value={getValue(key)}
                      onChange={e => set(key, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a] transition-colors ${edits[key] !== undefined ? "border-[#1a7a6a] bg-green-50/30" : "border-gray-200"}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Catatan Penting</p>
        <p>Perubahan tarif di sini akan langsung mempengaruhi perhitungan biaya panggilan untuk order baru. Platform fee (%) berlaku untuk semua layanan. Biaya Layanan & Admin adalah biaya tetap yang dibayar pengguna.</p>
      </div>

      {/* Admin Accounts */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Akun Admin</h3>
          <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#1a3a5c] border border-gray-200 px-2.5 py-1 rounded-lg hover:border-[#1a3a5c] transition-colors">
            <RefreshCw size={12} className={seedMut.isPending ? "animate-spin" : ""} /> Init Admin Default
          </button>
        </div>
        <div className="p-5 space-y-5">
          {/* List */}
          <div className="space-y-2">
            {(adminList ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{a.name}</p>
                  <p className="text-xs text-gray-400">{a.email}</p>
                </div>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
              </div>
            ))}
          </div>

          {/* Create new admin */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Plus size={14} /> Tambah Admin Baru</p>
            {adminSaved && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs">{adminSaved}</div>}
            {createAdminMut.isError && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{(createAdminMut.error as any)?.message}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama lengkap"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
              <input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="Email"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
              <input type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="Password (min. 6 karakter)"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a7a6a]" />
            </div>
            <button
              onClick={() => createAdminMut.mutate(adminForm)}
              disabled={!adminForm.name || !adminForm.email || !adminForm.password || createAdminMut.isPending}
              className="mt-3 px-4 py-2 bg-[#1a3a5c] text-white rounded-lg text-sm font-medium hover:bg-[#152f4d] disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {createAdminMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tambah Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
