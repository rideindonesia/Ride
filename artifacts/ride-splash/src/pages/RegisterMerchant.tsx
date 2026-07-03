import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { CITIES } from "@/data/indonesian-cities";
import { takeWarungHandoff } from "@/lib/warungHandoff";
import LocationPicker from "@/components/LocationPicker";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Step = 1 | 2 | 3 | 4;

interface FormData {
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  shopName: string;
  description: string;
  address: string;
  operatingCity: string;
  lat: string;
  lng: string;
  ktpFile: File | null;
  shopPhotoFile: File | null;
}

const INITIAL_FORM: FormData = {
  ownerName: "", email: "", phone: "", password: "", confirmPassword: "",
  agreeTerms: false, shopName: "", description: "", address: "",
  operatingCity: "", lat: "", lng: "", ktpFile: null, shopPhotoFile: null,
};

export default function RegisterMerchant() {
  const [, navigate] = useLocation();
  const [handoff] = useState(() => takeWarungHandoff());
  const fromMitra = !!handoff;
  const [step, setStep] = useState<Step>(fromMitra ? 2 : 1);
  const [form, setForm] = useState<FormData>(() =>
    handoff
      ? {
          ...INITIAL_FORM,
          ownerName: handoff.ownerName,
          email: handoff.email,
          phone: handoff.phone,
          password: handoff.password,
          confirmPassword: handoff.confirmPassword,
          agreeTerms: true,
        }
      : INITIAL_FORM
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleBack = () => {
    if (fromMitra && step === 2) navigate("/register/form?role=mitra");
    else if (step === 1) navigate("/register");
    else setStep(prev => (prev - 1) as Step);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.append("ownerName", form.ownerName);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("password", form.password);
      fd.append("shopName", form.shopName);
      fd.append("category", "food");
      fd.append("description", form.description);
      fd.append("address", form.address);
      fd.append("operatingCity", form.operatingCity);
      if (form.lat.trim()) fd.append("lat", form.lat.trim());
      if (form.lng.trim()) fd.append("lng", form.lng.trim());
      if (form.ktpFile) fd.append("ktp", form.ktpFile);
      if (form.shopPhotoFile) fd.append("shopPhoto", form.shopPhotoFile);

      const res = await fetch(`${BASE}/api/merchant/apply`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "Terjadi kesalahan");
        setSubmitting(false);
        return;
      }
      setStep(4);
    } catch {
      setSubmitError("Gagal menghubungi server. Coba lagi.");
    }
    setSubmitting(false);
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 50%, #1c4a5a 100%)", overflow: "hidden" }}>
      <Header step={step} fromMitra={fromMitra} onBack={step < 4 ? handleBack : undefined} />
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", overflow: "auto" }}>
        {step === 1 && <Step1 form={form} setField={setField} onNext={() => setStep(2)} />}
        {step === 2 && <Step2 form={form} setField={setField} onNext={() => setStep(3)} onBack={handleBack} />}
        {step === 3 && <Step3 form={form} setField={setField} onSubmit={handleSubmit} onBack={() => setStep(2)} submitting={submitting} error={submitError} />}
        {step === 4 && <Step4 form={form} onLogin={() => navigate("/login")} />}
      </div>
    </div>
  );
}

function Header({ step, fromMitra, onBack }: { step: Step; fromMitra: boolean; onBack?: () => void }) {
  const total = fromMitra ? 3 : 4;
  const displayCurrent = fromMitra ? step - 1 : step;
  return (
    <div style={{ paddingTop: 48, paddingBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", flex: "0 0 auto" }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ position: "absolute", top: 48, left: 20, width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px", backdropFilter: "blur(4px)" }}
        >&lt;-</button>
      )}
      <svg width="52" height="58" viewBox="0 0 120 134" fill="none">
        <polygon points="60,4 112,33 112,101 60,130 8,101 8,33" stroke="rgba(100,200,200,0.7)" strokeWidth="3" fill="none" />
        <polygon points="60,18 98,40 98,94 60,116 22,94 22,40" stroke="rgba(80,180,180,0.5)" strokeWidth="2" fill="none" />
        <text x="60" y="78" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="38" fontWeight="700" fontFamily="'Inter', sans-serif">R</text>
      </svg>
      <div style={{ marginTop: 8, color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Daftar Warung</div>
      <StepIndicator current={displayCurrent} total={total} />
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 0 }}>
      {Array.from({ length: total }, (_, i) => i + 1).map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <div style={{ width: 28, height: 2, background: s <= current ? "#2ecc71" : "rgba(255,255,255,0.3)" }} />
          )}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: s < current ? "#2ecc71" : s === current ? "#fff" : "rgba(255,255,255,0.25)",
            border: "none",
            fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14,
            color: s < current ? "#fff" : s === current ? "#1a3a5c" : "rgba(255,255,255,0.6)",
          }}>
            {s < current ? "✓" : s}
          </div>
        </div>
      ))}
    </div>
  );
}

function Step1({ form, setField, onNext }: { form: FormData; setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void; onNext: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    if (!form.ownerName.trim()) return "Nama pemilik wajib diisi";
    if (!form.email.trim()) return "Email wajib diisi";
    if (!form.phone.trim()) return "Nomor HP wajib diisi";
    if (form.password.length < 8) return "Password minimal 8 karakter";
    if (form.password !== form.confirmPassword) return "Password tidak cocok";
    if (!form.agreeTerms) return "Anda harus menyetujui syarat dan ketentuan";
    return null;
  };

  const handleNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    onNext();
  };

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Data Pemilik &amp; Akun</SectionTitle>
      <Card>
        <Field label="Nama Pemilik">
          <Input type="text" value={form.ownerName} onChange={v => setField("ownerName", v)} placeholder="Sesuai KTP" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={v => setField("email", v)} placeholder="warung@contoh.com" />
        </Field>
        <Field label="Nomor HP (WhatsApp)">
          <div style={{ display: "flex", borderRadius: 10, border: "1.5px solid #d0dce8", background: "#f8fafc", overflow: "hidden" }}>
            <div style={{ padding: "13px 12px", background: "#eef3f8", borderRight: "1.5px solid #d0dce8", fontSize: 15, fontWeight: 600, color: "#1a3a5c", fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>+62</div>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setField("phone", "+62" + e.target.value.replace(/\D/g, "").replace(/^0+/, "").replace(/^62/, ""))}
              placeholder="8xx xxxx xxxx"
              style={{ flex: 1, padding: "13px 14px", border: "none", outline: "none", fontSize: 15, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", background: "transparent" }}
            />
          </div>
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={v => setField("password", v)} placeholder="Min. 8 karakter" />
        </Field>
        <Field label="Konfirmasi Password">
          <Input type="password" value={form.confirmPassword} onChange={v => setField("confirmPassword", v)} placeholder="Ulangi password" />
        </Field>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
          <input type="checkbox" checked={form.agreeTerms} onChange={e => setField("agreeTerms", e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: "#1a7a6a" }} />
          <span style={{ fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
            Saya menyetujui Syarat Ketentuan dan Kebijakan Privasi Warung
          </span>
        </label>
      </Card>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <BottomBar>
        <NextBtn onClick={handleNext}>Lanjut</NextBtn>
      </BottomBar>
    </div>
  );
}

function Step2({ form, setField, onNext, onBack }: { form: FormData; setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void; onNext: () => void; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(form.operatingCity);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = query.trim().length >= 2
    ? CITIES.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const selectCity = (city: string) => {
    setField("operatingCity", city);
    setQuery(city);
    setShowDropdown(false);
  };

  const handleNext = () => {
    if (!form.shopName.trim()) { setError("Nama warung wajib diisi"); return; }
    if (!form.address.trim()) { setError("Alamat warung wajib diisi"); return; }
    if (!form.operatingCity) { setError("Pilih kota/kabupaten operasi"); return; }
    setError(null);
    onNext();
  };

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Data Warung</SectionTitle>
      <Card>
        <Field label="Nama Warung">
          <Input type="text" value={form.shopName} onChange={v => setField("shopName", v)} placeholder="Contoh: Warung Makan Berkah" />
        </Field>
        <Field label="Deskripsi Warung">
          <textarea
            value={form.description}
            onChange={e => setField("description", e.target.value)}
            placeholder="Ceritakan menu andalan warung Anda..."
            rows={3}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#f8fafc", color: "#1a2a3a", resize: "vertical" }}
          />
        </Field>
        <Field label="Alamat Lengkap">
          <textarea
            value={form.address}
            onChange={e => setField("address", e.target.value)}
            placeholder="Jl. Contoh No. 1, Kelurahan, Kecamatan"
            rows={2}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#f8fafc", color: "#1a2a3a", resize: "vertical" }}
          />
        </Field>
        <Field label="Kota / Kabupaten">
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); setField("operatingCity", ""); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Ketik nama kota atau kabupaten..."
              style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#f8fafc", color: "#1a2a3a" }}
            />
            {showDropdown && filtered.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden", maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
                {filtered.map(city => (
                  <button
                    key={city}
                    onClick={() => selectCity(city)}
                    style={{ display: "block", width: "100%", padding: "12px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", borderBottom: "1px solid #f0f4f8" }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
          {form.operatingCity && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(26,122,106,0.08)", fontSize: 14, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>
              ✓ {form.operatingCity}
            </div>
          )}
        </Field>
        <Field label="Titik Lokasi Warung (Peta)">
          <LocationPicker lat={form.lat} lng={form.lng} onChange={(la, ln) => { setField("lat", la); setField("lng", ln); }} />
        </Field>
        <div style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
          Titik lokasi membantu ojol menuju warung Anda dengan tepat, dan pengguna melihat seberapa dekat warung dari lokasi mereka.
        </div>
      </Card>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <BottomBar>
        <BackBtn onClick={onBack}>Kembali</BackBtn>
        <NextBtn onClick={handleNext}>Lanjut</NextBtn>
      </BottomBar>
    </div>
  );
}

function Step3({ form, setField, onSubmit, onBack, submitting, error }: {
  form: FormData;
  setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const ktpRef = useRef<HTMLInputElement>(null);
  const shopRef = useRef<HTMLInputElement>(null);

  const docs = [
    { key: "ktpFile" as const, label: "KTP Pemilik", tag: "ID", desc: "Foto KTP pemilik yang jelas", required: true, ref: ktpRef, file: form.ktpFile },
    { key: "shopPhotoFile" as const, label: "Foto Warung", tag: "Foto", desc: "Foto tampak depan warung", required: true, ref: shopRef, file: form.shopPhotoFile },
  ];

  const handleSubmit = () => {
    if (!form.ktpFile) { setLocalError("Foto KTP wajib diunggah"); return; }
    if (!form.shopPhotoFile) { setLocalError("Foto warung wajib diunggah"); return; }
    setLocalError(null);
    onSubmit();
  };

  const canSubmit = !!form.ktpFile && !!form.shopPhotoFile && !submitting;

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Upload Dokumen</SectionTitle>
      <div style={{ color: "#7a8a9a", fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Dokumen untuk proses verifikasi warung</div>
      <Card>
        {docs.map((doc, idx) => (
          <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx < docs.length - 1 ? "1px solid #e8f0f8" : "none" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(26,122,106,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>{doc.tag}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>
                {doc.label} {doc.required && <span style={{ color: "#e74c3c", fontSize: 12 }}>*wajib</span>}
              </div>
              <div style={{ fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>{doc.desc}</div>
              {doc.file && <div style={{ fontSize: 11, color: "#1a7a6a", marginTop: 2, fontFamily: "'Inter', sans-serif" }}>✓ {doc.file.name}</div>}
            </div>
            <input ref={doc.ref} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setField(doc.key, f); }} />
            <button
              onClick={() => doc.ref.current?.click()}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Inter', sans-serif", cursor: "pointer", flexShrink: 0 }}
            >Upload</button>
          </div>
        ))}
      </Card>
      {(localError || error) && <ErrorMsg>{localError ?? error}</ErrorMsg>}
      <BottomBar>
        <BackBtn onClick={onBack}>Kembali</BackBtn>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{ flex: 1, padding: "16px", borderRadius: 14, border: "none", background: canSubmit ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#b0c4d0", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {submitting ? "Mengirim..." : "Kirim Pendaftaran"}
        </button>
      </BottomBar>
    </div>
  );
}

function Step4({ form, onLogin }: { form: FormData; onLogin: () => void }) {
  return (
    <div style={{ padding: "40px 20px 40px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(255,200,50,0.15)", border: "3px solid #f39c12", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>OK</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f39c12", fontFamily: "'Inter', sans-serif" }}>Pendaftaran Diterima!</div>
        <div style={{ fontSize: 14, color: "#7a8a9a", textAlign: "center", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
          Warung Anda sedang menunggu persetujuan admin. Anda belum bisa masuk hingga pendaftaran disetujui. Kami akan menghubungi via WhatsApp setelah verifikasi selesai.
        </div>
      </div>

      <div style={{ marginTop: 28, background: "#fff", borderRadius: 16, padding: "20px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Status Pendaftaran:</div>
        {[
          { label: "Data Pemilik", status: "Lengkap", color: "#2ecc71" },
          { label: "Nama Warung", status: form.shopName || "-", color: "#2ecc71" },
          { label: "Dokumen", status: "Dalam Review", color: "#f39c12" },
          { label: "Area Operasi", status: form.operatingCity || "-", color: "#2ecc71" },
          { label: "Persetujuan Admin", status: "Menunggu", color: "#f39c12" },
        ].map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f4f8" }}>
            <span style={{ fontSize: 14, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>{row.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Inter', sans-serif", color: "#fff", background: row.color, borderRadius: 20, padding: "3px 12px" }}>
              {row.status}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onLogin}
        style={{ marginTop: 28, width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}
      >
        Kembali ke Login
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>{children}</div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#fff", borderRadius: 16, padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ type, value, onChange, placeholder }: { type: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#f8fafc", color: "#1a2a3a" }} />
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 12, color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>{children}</div>;
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px 28px", background: "#f0f4f8", borderTop: "1px solid #e0eaf0", display: "flex", gap: 12 }}>
      {children}
    </div>
  );
}

function BackBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "16px 20px", borderRadius: 14, border: "1.5px solid #d0dce8", background: "#fff", color: "#1a3a5c", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function NextBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>
      {children}
    </button>
  );
}
