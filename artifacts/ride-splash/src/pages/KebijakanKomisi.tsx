export default function KebijakanKomisi() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Kebijakan Platform & Komisi</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>Untuk Mitra RIDE</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", lineHeight: 1.7, color: "#2d3748" }}>

          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 16 }}>Terakhir diperbarui: 22 April 2026</div>

          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Kebijakan ini mengatur sistem platform fee (komisi) yang berlaku bagi seluruh mitra RIDE. Harap baca dengan seksama agar Anda memahami cara penghitungan dan mekanisme pembayaran komisi.
          </p>

          <Section title="1. Apa itu Platform Fee?">
            <p>Platform fee adalah biaya yang dipungut oleh RIDE atas setiap transaksi yang berhasil diselesaikan oleh mitra melalui platform. Platform fee merupakan kompensasi atas penyediaan teknologi, sistem pemesanan, dan layanan dukungan pelanggan yang disediakan RIDE.</p>
          </Section>

          <Section title="2. Besaran Platform Fee">
            <p>Platform fee saat ini ditetapkan sebesar <strong>persentase tertentu dari biaya panggilan</strong> per order yang dapat dilihat di halaman beranda mitra Anda. Besaran fee ini dapat berubah sewaktu-waktu dengan pemberitahuan minimal 14 hari sebelumnya.</p>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 14, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 6 }}>Yang Dikenakan Fee:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li>Biaya panggilan / biaya jasa yang dikenakan kepada pengguna</li>
              </ul>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginTop: 10, marginBottom: 6 }}>Yang TIDAK Dikenakan Fee:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li>Biaya sparepart / material tambahan</li>
                <li>Biaya perjalanan (jika disepakati terpisah)</li>
                <li>Biaya lain yang tidak termasuk biaya jasa</li>
              </ul>
            </div>
          </Section>

          <Section title="3. Cara Penghitungan">
            <p>Penghitungan platform fee dilakukan secara otomatis oleh sistem saat order dinyatakan selesai:</p>
            <div style={{ background: "#f8faff", borderRadius: 12, padding: 14, marginTop: 10, fontFamily: "monospace" }}>
              <div style={{ fontSize: 12, color: "#2563eb", marginBottom: 8 }}>Contoh Perhitungan:</div>
              <div style={{ fontSize: 12, color: "#1a2a3a", lineHeight: 2 }}>
                Biaya jasa yang disepakati : Rp 100.000<br />
                Platform fee (misal 15%)   : Rp 15.000<br />
                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
                  Pendapatan bersih mitra    : Rp 85.000
                </div>
              </div>
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: "#7a8a9a" }}>Catatan: Biaya sparepart Rp 50.000 tidak termasuk dalam perhitungan di atas dan langsung menjadi hak mitra sepenuhnya.</p>
          </Section>

          <Section title="4. Periode Tagihan Komisi">
            <ul>
              <li>Platform fee dihitung per order yang berhasil diselesaikan</li>
              <li>Tagihan komisi direkap setiap periode yang ditentukan (mingguan atau bulanan sesuai kebijakan berlaku)</li>
              <li>Mitra dapat melihat rincian tagihan dan riwayat komisi di halaman beranda mitra</li>
              <li>Komisi yang belum dilunasi akan ditampilkan sebagai tagihan aktif di aplikasi</li>
            </ul>
          </Section>

          <Section title="5. Pembayaran Platform Fee">
            <SubTitle>5.1. Cara Pembayaran</SubTitle>
            <ul>
              <li>Pembayaran platform fee dilakukan melalui mekanisme yang ditentukan oleh RIDE (transfer bank, pemotongan saldo, atau metode lain yang berlaku)</li>
              <li>Detail metode pembayaran akan dikomunikasikan melalui aplikasi dan email</li>
            </ul>
            <SubTitle>5.2. Batas Waktu Pembayaran</SubTitle>
            <ul>
              <li>Platform fee harus dilunasi sesuai tanggal jatuh tempo yang tertera di tagihan</li>
              <li>Keterlambatan pembayaran dapat mengakibatkan pembatasan sementara pada akun mitra</li>
              <li>Akun mitra dengan tunggakan lebih dari batas waktu yang ditentukan dapat dinonaktifkan</li>
            </ul>
          </Section>

          <Section title="6. Pencairan Saldo Mitra">
            <ul>
              <li>Saldo bersih mitra (setelah dikurangi platform fee) dapat dicairkan sesuai ketentuan pencairan yang berlaku</li>
              <li>Mitra wajib mendaftarkan rekening bank aktif atas nama sendiri untuk pencairan</li>
              <li>Minimum saldo untuk pencairan ditentukan sesuai kebijakan yang berlaku</li>
              <li>Proses pencairan membutuhkan waktu 1–3 hari kerja</li>
              <li>RIDE tidak bertanggung jawab atas keterlambatan transfer yang disebabkan oleh pihak bank</li>
            </ul>
          </Section>

          <Section title="7. Program Mitra Unggulan">
            <p>Mitra dengan kinerja tinggi dapat mengajukan diri ke program Mitra Unggulan dengan keuntungan:</p>
            <ul>
              <li>Platform fee yang lebih rendah dari standar</li>
              <li>Badge "Mitra Unggulan" di profil yang meningkatkan kepercayaan pengguna</li>
              <li>Prioritas tampil di pencarian pengguna</li>
              <li>Akses ke fitur dan program eksklusif RIDE</li>
            </ul>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 12, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 6 }}>Syarat Program Mitra Unggulan:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li>Rating rata-rata minimal ≥ 4.8 bintang</li>
                <li>Jumlah order selesai minimal 50 order</li>
                <li>Tidak memiliki riwayat pelanggaran ketentuan</li>
                <li>Tidak memiliki tunggakan platform fee</li>
              </ul>
            </div>
          </Section>

          <Section title="8. Perubahan Kebijakan Komisi">
            <p>RIDE berhak mengubah besaran platform fee dan ketentuan komisi kapan saja. Perubahan akan diberitahukan melalui notifikasi aplikasi dan/atau email minimal <strong>14 hari</strong> sebelum berlaku. Penggunaan platform setelah perubahan berlaku dianggap sebagai persetujuan atas kebijakan baru.</p>
          </Section>

          <Section title="9. Penyelesaian Sengketa Komisi">
            <p>Jika Anda menemukan ketidaksesuaian dalam perhitungan komisi atau tagihan:</p>
            <ul>
              <li>Ajukan keberatan dalam 7 hari setelah tagihan diterbitkan</li>
              <li>Kirim detail order yang bermasalah ke email mitra@rideindonesia.com</li>
              <li>Tim RIDE akan meninjau dan memberikan respons dalam 3 hari kerja</li>
            </ul>
          </Section>

          <Section title="10. Hubungi Kami">
            <p>Pertanyaan terkait komisi dan pembayaran:</p>
            <ul>
              <li><strong>Email Mitra:</strong> mitra@rideindonesia.com</li>
              <li><strong>Telepon:</strong> +62 878 6821 5823</li>
              <li><strong>Alamat:</strong> Balikpapan, Indonesia</li>
            </ul>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", marginBottom: 8, borderLeft: "3px solid #0ea56a", paddingLeft: 10 }}>{title}</div>
      <div style={{ fontSize: 13, paddingLeft: 4 }}>{children}</div>
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "#2d3748", marginTop: 10, marginBottom: 4 }}>{children}</div>;
}
