import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrderReviewData {
  orderNo: string;
  vehicleModel: string;
  vehicleYear: string;
  mitraName: string | null;
  damageCategories: string[] | null;
  rating: number | null;
  reviewComment: string | null;
}

export default function ReviewPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();
  const [order, setOrder] = useState<OrderReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    fetch(`${BASE}/api/pengguna/orders/${orderId}/receipt`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setOrder(d);
        if (d.rating) {
          setRating(d.rating);
          setComment(d.reviewComment ?? "");
          setSubmitted(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

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

  const starLabels = ["", "Sangat Buruk", "Buruk", "Cukup", "Bagus", "Sangat Bagus"];
  const starColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

  if (loading) return (
    <div style={{ minHeight: "100dvh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 14, color: "#9aa5b4" }}>Memuat data...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #1a3a5c 0%, #1a7a6a 100%)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "48px 20px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => navigate("/dashboard/pengguna")}
          style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ←
        </button>
        <div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Beri Ulasan</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Bagikan pengalaman Anda</div>
        </div>
      </div>

      {/* Card */}
      <div style={{ flex: 1, background: "#f0f4f8", borderRadius: "24px 24px 0 0", padding: "24px 16px 40px", overflowY: "auto" }}>

        {/* Order Info */}
        {order && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "16px", marginBottom: 16, border: "1.5px solid #e0e8f0" }}>
            <div style={{ fontSize: 12, color: "#9aa5b4", fontWeight: 700, marginBottom: 8 }}>DETAIL PESANAN</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#7a8a9a" }}>No. Pesanan</span>
                <span style={{ color: "#1a2a3a", fontWeight: 700 }}>{order.orderNo}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#7a8a9a" }}>Kendaraan</span>
                <span style={{ color: "#1a2a3a", fontWeight: 600 }}>{order.vehicleModel} {order.vehicleYear}</span>
              </div>
              {order.mitraName && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "#7a8a9a" }}>Mitra</span>
                  <span style={{ color: "#1a2a3a", fontWeight: 600 }}>{order.mitraName}</span>
                </div>
              )}
              {order.damageCategories && order.damageCategories.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "#7a8a9a" }}>Layanan</span>
                  <span style={{ color: "#1a2a3a", fontWeight: 600, textAlign: "right", maxWidth: "55%" }}>{order.damageCategories.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submitted State */}
        {submitted ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 20px", border: "1.5px solid #e0e8f0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌟</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a", marginBottom: 6 }}>Ulasan Terkirim!</div>
            <div style={{ fontSize: 13, color: "#7a8a9a", marginBottom: 20 }}>Terima kasih, ulasan Anda membantu mitra berkembang</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 12 }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} style={{ fontSize: 28, color: s <= rating ? "#f59e0b" : "#e0e8f0" }}>★</span>
              ))}
            </div>
            {comment && (
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#4a5a6a", fontStyle: "italic", marginBottom: 20 }}>
                "{comment}"
              </div>
            )}
            <button onClick={() => navigate("/dashboard/pengguna")}
              style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Kembali ke Beranda
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
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{ background: "none", border: "none", fontSize: 40, cursor: "pointer", color: s <= (hoverRating || rating) ? "#f59e0b" : "#e0e8f0", transition: "transform 0.1s", transform: s <= (hoverRating || rating) ? "scale(1.15)" : "scale(1)", padding: 2 }}>
                    ★
                  </button>
                ))}
              </div>
              {(hoverRating || rating) > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: starColors[hoverRating || rating] }}>
                  {starLabels[hoverRating || rating]}
                </div>
              )}
            </div>

            {/* Comment */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", marginBottom: 14, border: "1.5px solid #e0e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginBottom: 10 }}>Komentar <span style={{ color: "#9aa5b4", fontWeight: 400 }}>(opsional)</span></div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Ceritakan pengalaman Anda menggunakan layanan ini..."
                rows={4}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e0e8f0", fontSize: 14, outline: "none", resize: "none", color: "#1a2a3a", background: "#f8fafc", boxSizing: "border-box", lineHeight: 1.5 }}
              />
              <div style={{ fontSize: 11, color: "#9aa5b4", textAlign: "right", marginTop: 4 }}>{comment.length}/300</div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#dc2626", textAlign: "center" }}>
                {error}
              </div>
            )}

            <button onClick={submit} disabled={submitting || rating === 0}
              style={{ width: "100%", padding: "16px", borderRadius: 16, border: "none", background: rating === 0 ? "#e0e8f0" : "linear-gradient(135deg, #1a3a5c, #1a7a6a)", color: rating === 0 ? "#9aa5b4" : "#fff", fontWeight: 700, fontSize: 16, cursor: rating === 0 ? "default" : "pointer" }}>
              {submitting ? "Mengirim..." : "⭐ Kirim Ulasan"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
