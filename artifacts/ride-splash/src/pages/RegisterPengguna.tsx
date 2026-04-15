import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useRegisterPengguna, useVerifyOtpPengguna, useResendOtpPengguna } from "@workspace/api-client-react";

type Step = "form" | "otp" | "success";

export default function RegisterPengguna() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("form");
  const [phone, setPhone] = useState("");
  const [otpFromServer, setOtpFromServer] = useState("");

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "#0d2137", overflow: "hidden" }}>
      <Header onBack={step === "otp" ? () => setStep("form") : undefined} />
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "28px 28px 0 0", overflow: "auto" }}>
        {step === "form" && (
          <FormStep
            onSuccess={(p, otp) => { setPhone(p); setOtpFromServer(otp); setStep("otp"); }}
          />
        )}
        {step === "otp" && (
          <OtpStep
            phone={phone}
            otpFromServer={otpFromServer}
            onSuccess={() => setStep("success")}
            onResend={(otp) => setOtpFromServer(otp)}
          />
        )}
        {step === "success" && (
          <SuccessStep onLogin={() => navigate("/login")} />
        )}
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ background: "linear-gradient(180deg, #0d2137 0%, #1a3a5c 50%, #1c4a5a 100%)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 48, paddingBottom: 32, flex: "0 0 auto", position: "relative" }}>
      <button
        onClick={onBack ?? (() => navigate("/register"))}
        style={{ position: "absolute", top: 48, left: 20, width: 44, height: 44, borderRadius: 14, background: "rgba(30,50,70,0.7)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-1px" }}
      >
        &lt;-
      </button>
      <svg width="64" height="72" viewBox="0 0 120 134" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="60,4 112,33 112,101 60,130 8,101 8,33" stroke="rgba(100,200,200,0.7)" strokeWidth="3" fill="none" />
        <polygon points="60,18 98,40 98,94 60,116 22,94 22,40" stroke="rgba(80,180,180,0.5)" strokeWidth="2" fill="none" />
        <text x="60" y="78" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="38" fontWeight="700" fontFamily="'Inter', sans-serif">R</text>
      </svg>
      <div style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>Daftar sebagai</div>
      <div style={{ marginTop: 4, color: "#ffffff", fontSize: 22, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Pengguna Baru</div>
    </div>
  );
}

function FormStep({ onSuccess }: { onSuccess: (phone: string, otp: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useRegisterPengguna({
    mutation: {
      onSuccess: (data) => {
        onSuccess(data.phone, data.otpCode ?? "");
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "Terjadi kesalahan");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({ data: { name, phone, email, password, confirmPassword, agreeTerms } });
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "28px 20px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Nama Lengkap">
        <Input type="text" value={name} onChange={setName} placeholder="Masukkan nama lengkap" required />
      </Field>
      <Field label="Nomor HP">
        <Input type="tel" value={phone} onChange={setPhone} placeholder="+62 812-xxxx-xxxx" required />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={setEmail} placeholder="email@contoh.com" required />
      </Field>
      <Field label="Password">
        <Input type="password" value={password} onChange={setPassword} placeholder="Min. 8 karakter" required minLength={8} />
      </Field>
      <Field label="Konfirmasi Password">
        <Input type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Ulangi password" required />
      </Field>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 4 }}>
        <input
          type="checkbox"
          checked={agreeTerms}
          onChange={e => setAgreeTerms(e.target.checked)}
          style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: "#1a7a6a" }}
        />
        <span style={{ fontSize: 13, color: "#4a6a7a", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
          Saya menyetujui Syarat Ketentuan serta Kebijakan Privasi RIDE
        </span>
      </label>

      {error && (
        <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{ marginTop: 8, padding: "16px", borderRadius: 14, border: "none", background: mutation.isPending || !agreeTerms ? "#b0c4d0" : "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: mutation.isPending || !agreeTerms ? "not-allowed" : "pointer" }}
      >
        {mutation.isPending ? "Memproses..." : "Lanjut"}
      </button>
    </form>
  );
}

function OtpStep({ phone, otpFromServer, onSuccess, onResend }: { phone: string; otpFromServer: string; onSuccess: () => void; onResend: (otp: string) => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const verifyMutation = useVerifyOtpPengguna({
    mutation: {
      onSuccess: () => onSuccess(),
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "OTP tidak valid");
      },
    },
  });

  const resendMutation = useResendOtpPengguna({
    mutation: {
      onSuccess: (data) => {
        onResend(data.otpCode ?? "");
        setDigits(["", "", "", "", "", ""]);
        setError(null);
        refs[0].current?.focus();
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e?.response?.data?.error ?? "Gagal mengirim ulang OTP");
      },
    },
  });

  const handleDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 5) refs[index + 1].current?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  const handleVerify = () => {
    const otp = digits.join("");
    if (otp.length < 6) { setError("Masukkan 6 digit kode OTP"); return; }
    setError(null);
    verifyMutation.mutate({ data: { phone, otp } });
  };

  return (
    <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <div style={{ fontSize: 72, fontWeight: 800, color: "#1a2a3a", fontFamily: "'Inter', sans-serif", letterSpacing: "-2px", lineHeight: 1 }}>OTP</div>
      <div style={{ marginTop: 20, fontWeight: 700, fontSize: 18, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>Verifikasi OTP</div>
      <div style={{ marginTop: 8, fontSize: 14, color: "#7a8a9a", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>Kode 6 digit telah dikirim ke nomor HP Anda</div>
      {otpFromServer && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", background: "rgba(26,122,106,0.08)", borderRadius: 8, padding: "4px 12px" }}>
          Kode OTP (dev): <strong>{otpFromServer}</strong>
        </div>
      )}
      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            value={d}
            onChange={e => handleDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            maxLength={1}
            style={{ width: 48, height: 56, borderRadius: 12, border: "1.5px solid #d0dce8", textAlign: "center", fontSize: 22, fontWeight: 700, fontFamily: "'Inter', sans-serif", color: "#1a2a3a", background: "#fff", outline: "none" }}
          />
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#c0392b", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>{error}</div>
      )}

      <button
        onClick={handleVerify}
        disabled={verifyMutation.isPending}
        style={{ marginTop: 28, width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: verifyMutation.isPending ? "not-allowed" : "pointer", opacity: verifyMutation.isPending ? 0.7 : 1 }}
      >
        {verifyMutation.isPending ? "Memverifikasi..." : "Verifikasi"}
      </button>

      <div style={{ marginTop: 16, fontSize: 14, color: "#7a8a9a", fontFamily: "'Inter', sans-serif" }}>
        Tidak menerima kode?{" "}
        <button
          onClick={() => resendMutation.mutate({ data: { phone } })}
          disabled={resendMutation.isPending}
          style={{ background: "none", border: "none", color: "#1a7a6a", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
        >
          Kirim Ulang
        </button>
      </div>
    </div>
  );
}

function SuccessStep({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ padding: "60px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", border: "3px solid #2ecc71", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: "#1a2a3a", fontFamily: "'Inter', sans-serif" }}>OK</span>
      </div>
      <div style={{ marginTop: 24, fontSize: 20, fontWeight: 700, color: "#2ecc71", fontFamily: "'Inter', sans-serif" }}>Pendaftaran Berhasil!</div>
      <div style={{ marginTop: 12, fontSize: 14, color: "#7a8a9a", textAlign: "center", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
        Akun Anda telah dibuat. Silakan masuk untuk mulai menggunakan layanan RIDE.
      </div>
      <button
        onClick={onLogin}
        style={{ marginTop: 32, padding: "16px 48px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c 0%, #1a7a6a 100%)", color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Inter', sans-serif", cursor: "pointer" }}
      >
        Masuk Sekarang
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#1a7a6a", fontFamily: "'Inter', sans-serif", display: "block", marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ type, value, onChange, placeholder, required, minLength }: {
  type: string; value: string; onChange: (v: string) => void;
  placeholder: string; required?: boolean; minLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1.5px solid #d0dce8", fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff", color: "#1a2a3a" }}
    />
  );
}
