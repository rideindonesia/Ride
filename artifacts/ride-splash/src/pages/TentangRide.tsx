export default function TentangRide() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Tentang RIDE</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>PT. Alvi Utama Karya</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Header Brand */}
        <div style={{ background: "linear-gradient(135deg, #1a3a5c, #2563eb)", borderRadius: 20, padding: "32px 24px", textAlign: "center", marginBottom: 16, color: "#fff" }}>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, marginBottom: 8 }}>RIDE</div>
          <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.9 }}>Super App Jasa Panggilan</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Versi 1.0.0 · Balikpapan, Indonesia</div>
        </div>

        {/* Layanan */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>6 Layanan Tersedia</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { icon: "🔧", name: "Bengkel", desc: "Servis & perbaikan kendaraan" },
              { icon: "📱", name: "Elektronik", desc: "Perbaikan perangkat elektronik" },
              { icon: "🚿", name: "Cuci Kendaraan", desc: "Cuci motor & mobil di lokasi" },
              { icon: "✂️", name: "Barber", desc: "Potong rambut panggilan" },
              { icon: "🔍", name: "Inspeksi", desc: "Inspeksi kendaraan sebelum beli" },
              { icon: "🚛", name: "Towing", desc: "Derek kendaraan darurat" },
            ].map(s => (
              <div key={s.name} style={{ background: "#f8faff", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a", marginTop: 6 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#9aa5b4", marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cara Kerja */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>Cara Kerja RIDE</div>
          {[
            { no: "1", title: "Pilih Layanan", desc: "Pilih jenis layanan yang Anda butuhkan dari 6 kategori yang tersedia." },
            { no: "2", title: "Konfirmasi Lokasi", desc: "Pastikan lokasi Anda akurat agar mitra bisa menemukan Anda dengan mudah." },
            { no: "3", title: "Mitra Datang ke Lokasi", desc: "Mitra terdekat yang tersedia akan menerima dan datang ke lokasi Anda." },
            { no: "4", title: "Layanan Selesai & Bayar", desc: "Setelah layanan selesai, lakukan pembayaran sesuai biaya yang disepakati." },
            { no: "5", title: "Beri Ulasan", desc: "Bantu mitra dan pengguna lain dengan memberikan rating dan ulasan jujur." },
          ].map(s => (
            <div key={s.no} style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{s.no}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a3a" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#7a8a9a", marginTop: 3, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Visi & Misi */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>Visi & Misi</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", marginBottom: 6 }}>VISI</div>
            <div style={{ fontSize: 13, color: "#2d3748", lineHeight: 1.6 }}>
              Menjadi platform jasa panggilan terpercaya dan terdepan di Kalimantan, yang menghubungkan masyarakat dengan tenaga profesional berkualitas secara cepat, aman, dan terjangkau.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", marginBottom: 6 }}>MISI</div>
            <div style={{ fontSize: 13, color: "#2d3748", lineHeight: 1.6 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 6 }}>Memudahkan akses masyarakat terhadap layanan jasa berkualitas di mana pun mereka berada</li>
                <li style={{ marginBottom: 6 }}>Memberdayakan tenaga profesional lokal dengan memberikan platform yang adil dan transparan</li>
                <li style={{ marginBottom: 6 }}>Menghadirkan pengalaman layanan yang aman, cepat, dan dapat diandalkan</li>
                <li>Mendukung pertumbuhan ekonomi lokal Balikpapan melalui ekosistem layanan digital</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Perusahaan */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>Informasi Perusahaan</div>
          {[
            { label: "Nama Perusahaan", value: "PT. Alvi Utama Karya" },
            { label: "Produk", value: "RIDE — Super App Jasa Panggilan" },
            { label: "Area Operasional", value: "Balikpapan & sekitarnya" },
            { label: "Tahun Berdiri", value: "2026" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
              <div style={{ fontSize: 12, color: "#9aa5b4" }}>{r.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2a3a", textAlign: "right", maxWidth: "55%" }}>{r.value}</div>
            </div>
          ))}
        </div>

        {/* Kontak */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a3a", marginBottom: 14, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>Hubungi Kami</div>
          {[
            { icon: "📧", label: "Email", value: "support@rideindonesia.com" },
            { icon: "📞", label: "Telepon", value: "+62 878 6821 5823" },
            { icon: "📍", label: "Alamat", value: "Balikpapan, Indonesia" },
          ].map(c => (
            <div key={c.label} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f4f8" }}>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <div>
                <div style={{ fontSize: 11, color: "#9aa5b4" }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a3a" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
