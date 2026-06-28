export default function SyaratKetentuanPengguna() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Syarat & Ketentuan</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>Untuk Pengguna (Konsumen)</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", lineHeight: 1.7, color: "#2d3748" }}>

          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 16 }}>Terakhir diperbarui: 22 April 2026</div>

          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Selamat datang di Ride. Dengan mendaftar dan menggunakan aplikasi Ride, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan penggunaan berikut. Harap baca dengan seksama sebelum menggunakan layanan kami.
          </p>

          <Section title="1. Definisi">
            <ul>
              <li><strong>RIDE / Platform</strong> — Aplikasi layanan panggilan yang dikelola oleh PT. Alvi Utama Karya</li>
              <li><strong>Pengguna / Konsumen</strong> — Individu yang menggunakan aplikasi RIDE untuk memesan layanan</li>
              <li><strong>Mitra</strong> — Penyedia layanan independen yang terdaftar di platform RIDE</li>
              <li><strong>Layanan</strong> — Jasa yang tersedia di platform meliputi bengkel, elektronik, cuci kendaraan, barber, inspeksi, dan towing</li>
              <li><strong>Order / Pesanan</strong> — Permintaan layanan yang dibuat oleh pengguna melalui aplikasi</li>
            </ul>
          </Section>

          <Section title="2. Persyaratan Pengguna">
            <ul>
              <li>Berusia minimal 17 tahun atau memiliki persetujuan dari wali yang sah</li>
              <li>Memiliki nomor telepon aktif yang valid di Indonesia</li>
              <li>Menyediakan informasi yang akurat, lengkap, dan terkini saat mendaftar</li>
              <li>Bertanggung jawab penuh atas keamanan akun dan kata sandi Anda</li>
              <li>Tidak diperbolehkan membuat lebih dari satu akun pengguna</li>
            </ul>
          </Section>

          <Section title="3. Penggunaan Layanan">
            <SubTitle>3.1. Cara Pemesanan</SubTitle>
            <p>Pengguna dapat memesan layanan melalui aplikasi dengan memilih jenis layanan, menentukan lokasi, dan menunggu konfirmasi dari mitra terdekat. Pesanan dianggap aktif setelah dikonfirmasi oleh mitra.</p>
            <SubTitle>3.2. Lokasi Layanan</SubTitle>
            <p>Layanan RIDE saat ini tersedia di wilayah Balikpapan dan sekitarnya. Pengguna wajib memastikan lokasi yang dimasukkan akurat untuk memperlancar proses layanan.</p>
            <SubTitle>3.3. Ketersediaan Layanan</SubTitle>
            <p>Ketersediaan mitra tidak dapat dijamin setiap saat. RIDE tidak bertanggung jawab atas ketidaktersediaan mitra pada waktu tertentu.</p>
          </Section>

          <Section title="4. Pembatalan Pesanan">
            <ul>
              <li>Pengguna dapat membatalkan pesanan sebelum mitra mengkonfirmasi atau tiba di lokasi</li>
              <li>Pembatalan berulang tanpa alasan yang jelas dapat mengakibatkan pembatasan penggunaan akun</li>
              <li>Pesanan yang sudah dalam proses pengerjaan tidak dapat dibatalkan sepihak</li>
              <li>Jika mitra tidak hadir dalam waktu yang disepakati, pengguna berhak membatalkan pesanan tanpa penalti</li>
            </ul>
          </Section>

          <Section title="5. Pembayaran">
            <ul>
              <li>Biaya layanan ditentukan oleh mitra dan harus disepakati sebelum pekerjaan dimulai</li>
              <li>Transaksi pembayaran bersifat final setelah layanan dinyatakan selesai oleh kedua pihak</li>
              <li>Pengguna wajib membayar sesuai biaya yang telah disepakati, termasuk biaya sparepart jika ada</li>
              <li>RIDE tidak bertanggung jawab atas sengketa harga yang tidak dikomunikasikan sebelum pengerjaan</li>
              <li>Saldo RIDE (jika tersedia) hanya dapat digunakan untuk transaksi di dalam platform</li>
            </ul>
          </Section>

          <Section title="6. Ulasan dan Rating">
            <ul>
              <li>Pengguna dapat memberikan rating dan ulasan setelah pesanan selesai</li>
              <li>Ulasan harus jujur, berdasarkan pengalaman nyata, dan tidak mengandung konten yang menyinggung</li>
              <li>RIDE berhak menghapus ulasan yang melanggar ketentuan atau mengandung kata-kata tidak pantas</li>
              <li>Memberikan ulasan palsu atau ulasan yang diarahkan oleh pihak lain merupakan pelanggaran ketentuan</li>
            </ul>
          </Section>

          <Section title="7. Larangan Pengguna">
            <p>Pengguna dilarang untuk:</p>
            <ul>
              <li>Menggunakan platform untuk tujuan ilegal atau yang merugikan pihak lain</li>
              <li>Memberikan informasi palsu saat mendaftar atau memesan layanan</li>
              <li>Melakukan pemesanan fiktif atau pesanan yang sengaja tidak diteruskan</li>
              <li>Menghubungi atau bertransaksi dengan mitra di luar platform untuk menghindari sistem RIDE</li>
              <li>Melecehkan, mengancam, atau berlaku tidak sopan kepada mitra</li>
              <li>Memanipulasi sistem rating atau ulasan</li>
              <li>Memindahtangankan akun kepada pihak lain</li>
            </ul>
          </Section>

          <Section title="8. Tanggung Jawab Pengguna">
            <ul>
              <li>Pengguna bertanggung jawab memastikan lingkungan dan kondisi yang aman bagi mitra saat memberikan layanan</li>
              <li>Pengguna bertanggung jawab atas keakuratan informasi lokasi dan detail pesanan yang diberikan</li>
              <li>Segala kerugian akibat informasi yang tidak akurat menjadi tanggung jawab pengguna</li>
            </ul>
          </Section>

          <Section title="9. Batasan Tanggung Jawab RIDE">
            <ul>
              <li>RIDE berperan sebagai platform penghubung dan bukan penyedia layanan langsung</li>
              <li>RIDE tidak bertanggung jawab atas kualitas layanan yang diberikan oleh mitra secara langsung</li>
              <li>RIDE tidak menanggung kerusakan atau kerugian yang timbul akibat kelalaian mitra</li>
              <li>RIDE berupaya memastikan mitra yang terdaftar terverifikasi, namun tidak dapat menjamin setiap hasil layanan</li>
            </ul>
          </Section>

          <Section title="10. Penangguhan dan Penghapusan Akun">
            <p>RIDE berhak menangguhkan atau menghapus akun pengguna jika:</p>
            <ul>
              <li>Melanggar syarat dan ketentuan yang berlaku</li>
              <li>Terbukti melakukan penipuan atau penyalahgunaan platform</li>
              <li>Menerima laporan pelanggaran yang terbukti dari mitra</li>
              <li>Melakukan pembatalan pesanan berulang kali tanpa alasan valid</li>
            </ul>
          </Section>

          <Section title="11. Perubahan Layanan dan Ketentuan">
            <p>RIDE berhak mengubah, menangguhkan, atau menghentikan fitur layanan kapan saja dengan atau tanpa pemberitahuan sebelumnya. Perubahan pada Syarat & Ketentuan akan diberitahukan melalui aplikasi. Penggunaan berkelanjutan setelah perubahan dianggap sebagai persetujuan atas ketentuan baru.</p>
          </Section>

          <Section title="12. Hukum yang Berlaku">
            <p>Syarat dan Ketentuan ini tunduk pada hukum yang berlaku di Republik Indonesia. Segala sengketa yang timbul akan diselesaikan secara musyawarah, dan jika tidak tercapai kesepakatan, akan diselesaikan melalui jalur hukum yang berlaku di Indonesia.</p>
          </Section>

          <Section title="13. Hubungi Kami">
            <p>Jika Anda memiliki pertanyaan tentang Syarat & Ketentuan ini:</p>
            <ul>
              <li><strong>Email:</strong> support@rideindonesia.com</li>
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
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a3a", marginBottom: 8, borderLeft: "3px solid #2563eb", paddingLeft: 10 }}>{title}</div>
      <div style={{ fontSize: 13, paddingLeft: 4 }}>{children}</div>
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "#2d3748", marginTop: 10, marginBottom: 4 }}>{children}</div>;
}
