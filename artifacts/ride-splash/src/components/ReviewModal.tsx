import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  orderId: number | null;
  onClose: () => void;
}

const starLabels = ["", "Sangat Buruk", "Buruk", "Cukup", "Bagus", "Sangat Bagus"];
const starColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

export default function ReviewModal({ orderId, onClose }: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (rating === 0) { setError("Pilih bintang rating terlebih dahulu"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/pengguna/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) throw new Error("Gagal");
      setSubmitted(true);
    } catch {
      setError("Gagal mengirim ulasan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(10,20,40,0.65)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "#f0f4f8",
        borderRadius: "24px 24px 0 0",
        padding: "8px 16px 40px",
        maxHeight: "90dvh",
        overflowY: "auto",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, marginBottom: 16 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d0d8e4" }} />
        </div>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>⭐ Beri Ulasan</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: "1.5px solid #e0e8f0", background: "#fff", color: "#7a8a9a", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {submitted ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 20px", border: "1.5px solid #e0e8f0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌟</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a", marginBottom: 6 }}>Ulasan Terkirim!</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", marginBottom: 20 }}>Terima kasih, ulasan Anda membantu mitra berkembang</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 20 }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} style={{ fontSize: 28, color: s <= rating ? "#f59e0b" : "#e0e8f0" }}>★</span>
              ))}
            </div>
            <button onClick={onClose}
              style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Tutup
            </button>
          </div>
        ) : (
          <>
            {/* Star Rating */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "24px 20px", marginBottom: 14, border: "1.5px solid #e0e8f0", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", marginBottom: 6 }}>Bagaimana layanan mitra?</div>
              <div style={{ fontSize: 12, color: "#9aa5b4", marginBottom: 20 }}>Tap bintang untuk memberi nilai</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                {[1,2,3,4,5].map(s => (
                  <button key={s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(0)}
                    style={{ background: "none", border: "none", fontSize: 40, cursor: "pointer", color: s <= (hover || rating) ? "#f59e0b" : "#e0e8f0", transform: s <= (hover || rating) ? "scale(1.15)" : "scale(1)", transition: "transform 0.1s", padding: 2 }}>
                    ★
                  </button>
                ))}
              </div>
              {(hover || rating) > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: starColors[hover || rating] }}>
                  {starLabels[hover || rating]}
                </div>
              )}
            </div>

            {/* Comment */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", marginBottom: 14, border: "1.5px solid #e0e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>
                Komentar <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span>
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 300))}
                placeholder="Ceritakan pengalaman Anda menggunakan layanan ini..."
                rows={4}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", resize: "none", color: "#1a2a3a", background: "#f8fafc", boxSizing: "border-box" as const, lineHeight: 1.5, fontFamily: "inherit" }}
              />
              <div style={{ fontSize: 11, color: "#9aa5b4", textAlign: "right" as const, marginTop: 4 }}>{comment.length}/300</div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#dc2626", textAlign: "center" as const }}>
                {error}
              </div>
            )}

            <button onClick={submit} disabled={submitting || rating === 0}
              style={{ width: "100%", padding: "16px", borderRadius: 16, border: "none", background: rating === 0 ? "#e0e8f0" : "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: rating === 0 ? "#9aa5b4" : "#fff", fontWeight: 700, fontSize: 16, cursor: rating === 0 ? "default" : "pointer" }}>
              {submitting ? "Mengirim..." : "Kirim Ulasan"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
