import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { CITIES } from "@/data/indonesian-cities";

type Step = 1 | 2 | 3 | 4 | 5;

interface FormData {
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  serviceType: string;
  ktpFile: File | null;
  selfieKtpFile: File | null;
  simFile: File | null;
  certFile: File | null;
  operatingCity: string;
}

const SERVICES = [
  { id: "bengkel", label: "Bengkel Panggilan", emoji: "🔧" },
  { id: "etowing", label: "E-Towing", emoji: "🚛" },
  { id: "elektronik", label: "Service Elektronik", emoji: "💡" },
  { id: "laundry", label: "Laundry Panggilan", emoji: "👕" },
  { id: "cleaning", label: "Cleaning Panggilan", emoji: "🧹" },
  { id: "bangunan", label: "Tukang Bangunan", emoji: "🏗️" },
  { id: "pangkas", label: "Pangkas Rambut", emoji: "✂️" },
  { id: "cuci_kendaraan", label: "Cuci Kendaraan", emoji: "🚿" },
  { id: "inspeksi", label: "Inspeksi Kendaraan", emoji: "🔍" },
];

const INITIAL_FORM: FormData = {
  name: "", phone: "", email: "", password: "", confirmPassword: "",
  agreeTerms: false, serviceType: "", ktpFile: null, selfieKtpFile: null,
  simFile: null, certFile: null, operatingCity: "",
};

export default function RegisterMitra() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleBack = () => {
    if (step === 1) navigate("/register");
    else setStep(prev => (prev - 1) as Step);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("password", form.password);
      fd.append("serviceType", form.serviceType);
      fd.append("operatingCity", form.operatingCity);
      if (form.ktpFile) fd.append("ktp", form.ktpFile);
      if (form.selfieKtpFile) fd.append("selfieKtp", form.selfieKtpFile);
      if (form.simFile) fd.append("sim", form.simFile);
      if (form.certFile) fd.append("cert", form.certFile);

      const res = await fetch("/api/mitra/apply", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error ?? "Terjadi kesalahan");
        setSubmitting(false);
        return;
      }
      setStep(5);
    } catch {
      setSubmitError("Gagal menghubungi server. Coba lagi.");
    }
    setSubmitting(false);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 50%, #1c4a5a 100%)", overflow: "hidden" }}>
      <Header step={step} onBack={step < 5 ? handleBack : undefined} />
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", overflow: "auto" }}>
        {step === 1 && <Step1 form={form} setField={setField} onNext={() => setStep(2)} />}
        {step === 2 && <Step2 form={form} setField={setField} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 form={form} setField={setField} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <Step4 form={form} setField={setField} onSubmit={handleSubmit} onBack={() => setStep(3)} submitting={submitting} error={submitError} />}
        {step === 5 && <Step5 form={form} onLogin={() => navigate("/login")} />}
      </div>
    </div>
  );
}

function Header({ step, onBack }: { step: Step; onBack?: () => void }) {
  return (
    <div style={{ paddingTop: 48, paddingBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", flex: "0 0 auto" }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ position: "absolute", top: 48, left: 20, width: 44, height: 44, borderRadius: 14, background: "rgba(30,50,70,0.7)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px" }}
        >&lt;-</button>
      )}
      <svg width="52" height="58" viewBox="0 0 120 134" fill="none">
        <polygon points="60,4 112,33 112,101 60,130 8,101 8,33" stroke="rgba(100,200,200,0.7)" strokeWidth="3" fill="none" />
        <polygon points="60,18 98,40 98,94 60,116 22,94 22,40" stroke="rgba(80,180,180,0.5)" strokeWidth="2" fill="none" />
        <text x="60" y="78" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="38" fontWeight="700" fontFamily="'Inter', sans-serif">R</text>
      </svg>
      <div style={{ marginTop: 8, color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Daftar Mitra</div>
      <StepIndicator current={step} />
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 0 }}>
      {([1, 2, 3, 4, 5] as Step[]).map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <div style={{ width: 28, height: 2, background: s <= current ? "#2ecc71" : "rgba(255,255,255,0.3)" }} />
          )}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: s < current ? "#2ecc71" : s === current ? "#fff" : "rgba(255,255,255,0.25)",
            border: s === current ? "none" : "none",
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
    if (!form.name.trim()) return "Nama lengkap wajib diisi";
    if (!form.phone.trim()) return "Nomor HP wajib diisi";
    if (!form.email.trim()) return "Email wajib diisi";
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
      <SectionTitle>Data Diri</SectionTitle>
      <Card>
        <Field label="Nama Lengkap">
          <Input type="text" value={form.name} onChange={v => setField("name", v)} placeholder="Sesuai KTP" />
        </Field>
        <Field label="Nomor HP (WhatsApp)">
          <Input type="tel" value={form.phone} onChange={v => setField("phone", v)} placeholder="+62 812-xxxx-xxxx" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={v => setField("email", v)} placeholder="email@contoh.com" />
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
            Saya menyetujui Syarat Ketentuan Mitra dan Kebijakan Privasi
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

  const handleNext = () => {
    if (!form.serviceType) { setError("Pilih satu layanan"); return; }
    setError(null);
    onNext();
  };

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Pilih Layanan yang Dikuasai</SectionTitle>
      <div style={{ color: "#7a8a9a", fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Pilih 1 layanan untuk akun mitra Anda</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {SERVICES.map(svc => (
          <button
            key={svc.id}
            onClick={() => setField("serviceType", svc.id)}
            style={{
              padding: "16px 8px", borderRadius: 14,
              border: form.serviceType === svc.id ? "2.5px solid #1a7a6a" : "2px solid #e0eaf0",
              background: form.serviceType === svc.id ? "rgba(26,122,106,0.07)" : "#fff",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 32 }}>{svc.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: form.serviceType === svc.id ? "#1a7a6a" : "#1a2a3a", fontFamily: "'Inter', sans-serif", textAlign: "center", lineHeight: 1.3 }}>
              {svc.label}
            </span>
          </button>
        ))}
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <BottomBar>
        <BackBtn onClick={onBack}>Kembali</BackBtn>
        <NextBtn onClick={handleNext}>Lanjut</NextBtn>
      </BottomBar>
    </div>
  );
}

function Step3({ form, setField, onNext, onBack }: { form: FormData; setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void; onNext: () => void; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const ktpRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const simRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  const handleNext = () => {
    if (!form.ktpFile) { setError("Foto KTP wajib diunggah"); return; }
    if (!form.selfieKtpFile) { setError("Foto selfie + KTP wajib diunggah"); return; }
    setError(null);
    onNext();
  };

  const docs = [
    { key: "ktpFile" as const, label: "KTP", tag: "ID", desc: "Foto KTP yang jelas", required: true, ref: ktpRef, file: form.ktpFile },
    { key: "selfieKtpFile" as const, label: "Foto Diri + KTP", tag: "Selfie", desc: "Selfie sambil memegang KTP", required: true, ref: selfieRef, file: form.selfieKtpFile },
    { key: "simFile" as const, label: "SIM C / SIM A", tag: "SIM", desc: "Jika mendaftar layanan towing", required: false, ref: simRef, file: form.simFile },
    { key: "certFile" as const, label: "Sertifikat Keahlian", tag: "Cert", desc: "Sertifikat pendukung (opsional)", required: false, ref: certRef, file: form.certFile },
  ];

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Upload Dokumen</SectionTitle>
      <div style={{ color: "#7a8a9a", fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Dokumen untuk proses verifikasi</div>
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
            <input ref={doc.ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setField(doc.key, f); }} />
            <button
              onClick={() => doc.ref.current?.click()}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#1a3a5c", color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Inter', sans-serif", cursor: "pointer", flexShrink: 0 }}
            >Upload</button>
          </div>
        ))}
      </Card>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <BottomBar>
        <BackBtn onClick={onBack}>Kembali</BackBtn>
        <NextBtn onClick={handleNext}>Lanjut</NextBtn>
      </BottomBar>
    </div>
  );
}

function Step4({ form, setField, onSubmit, onBack, submitting, error }: {
  form: FormData;
  setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = query.trim().length >= 2
    ? CITIES.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const handleSelect = (city: string) => {
    setField("operatingCity", city);
    setQuery(city);
    setShowDropdown(false);
  };

  const canSubmit = !!form.operatingCity && !submitting;

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      <SectionTitle>Area Operasi</SectionTitle>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", marginBottom: 8 }}>
          Cari Kota / Kabupaten
        </div>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true); setField("operatingCity", ""); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Ketik nama kota atau kabupaten..."
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff", color: "#1a2a3a" }}
          />
          {showDropdown && filtered.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden", maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
              {filtered.map(city => (
                <button
                  key={city}
                  onClick={() => handleSelect(city)}
                  style={{ display: "block", width: "100%", padding: "12px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", borderBottom: "1px solid #f0f4f8" }}
                >
                  {city}
                </button>
              ))}
              <div style={{ padding: "8px 16px", fontSize: 12, color: "#7a8a9a", fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
                {CITIES.length} kota tersedia
              </div>
            </div>
          )}
        </div>
        {form.operatingCity && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(26,122,106,0.08)", fontSize: 14, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif" }}>
            ✓ {form.operatingCity}
          </div>
        )}
      </Card>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <BottomBar>
        <BackBtn onClick={onBack}>Kembali</BackBtn>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ flex: 1, padding: "16px", borderRadius: 14, border: "none", background: canSubmit ? "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)" : "#b0c4d0", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {submitting ? "Mengirim..." : "Kirim Pendaftaran"}
        </button>
      </BottomBar>
    </div>
  );
}

function Step5({ form, onLogin }: { form: FormData; onLogin: () => void }) {
  const serviceLabel = SERVICES.find(s => s.id === form.serviceType)?.label ?? form.serviceType;

  return (
    <div style={{ padding: "40px 20px 40px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(255,200,50,0.15)", border: "3px solid #f39c12", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>OK</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f39c12", fontFamily: "'Inter', sans-serif" }}>Pendaftaran Diterima!</div>
        <div style={{ fontSize: 14, color: "#7a8a9a", textAlign: "center", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
          Dokumen Anda sedang diverifikasi. Kami akan menghubungi via WhatsApp dalam 1×24 jam.
        </div>
      </div>

      <div style={{ marginTop: 28, background: "#fff", borderRadius: 16, padding: "20px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>Status Verifikasi:</div>
        {[
          { label: "Data Diri", status: "Lengkap", color: "#2ecc71" },
          { label: "Layanan", status: serviceLabel, color: "#2ecc71" },
          { label: "Dokumen", status: "Dalam Review", color: "#f39c12" },
          { label: "Area Operasi", status: form.operatingCity, color: "#2ecc71" },
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
