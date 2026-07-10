export default function KebijakanPrivasiPengguna() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Kebijakan Privasi</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>Untuk Pengguna (Konsumen)</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", lineHeight: 1.7, color: "#2d3748" }}>

          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 16 }}>Terakhir diperbarui: 22 April 2026</div>

          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Ride ( PT. Alvi Utama Karya ) berkomitmen untuk melindungi privasi Anda. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda saat menggunakan aplikasi Ride.
          </p>

          <Section title="1. Informasi yang Kami Kumpulkan">
            <SubTitle>1.1. Informasi Pribadi</SubTitle>
            <p>Kami mengumpulkan informasi yang Anda berikan saat mendaftar dan menggunakan layanan:</p>
            <ul>
              <li>Nama lengkap</li>
              <li>Nomor telepon</li>
              <li>Alamat email</li>
              <li>Kata sandi (terenkripsi)</li>
              <li>Foto profil (opsional)</li>
            </ul>
            <SubTitle>1.2. Informasi Lokasi</SubTitle>
            <p>Kami mengumpulkan data lokasi real-time untuk menghubungkan Anda dengan mitra terdekat, melacak perjalanan layanan, dan meningkatkan pengalaman pengguna. Data lokasi hanya aktif dikumpulkan selama sesi layanan berlangsung.</p>
            <SubTitle>1.3. Informasi Transaksi</SubTitle>
            <p>Riwayat pesanan, metode pembayaran, dan detail transaksi untuk keperluan layanan dan pencatatan keuangan.</p>
            <SubTitle>1.4. Data Perangkat</SubTitle>
            <ul>
              <li>Jenis perangkat dan sistem operasi</li>
              <li>Alamat IP</li>
              <li>Browser yang digunakan</li>
              <li>Log aktivitas aplikasi</li>
            </ul>
          </Section>

          <Section title="2. Penggunaan Informasi">
            <p>Kami menggunakan informasi Anda untuk:</p>
            <ul>
              <li>Menyediakan dan meningkatkan layanan Ride</li>
              <li>Menghubungkan Anda dengan mitra layanan terdekat</li>
              <li>Memproses transaksi dan pembayaran</li>
              <li>Mengirim notifikasi terkait pesanan dan layanan</li>
              <li>Menyediakan dukungan pelanggan</li>
              <li>Mencegah penipuan dan aktivitas ilegal</li>
              <li>Menganalisis penggunaan aplikasi untuk perbaikan layanan</li>
              <li>Mematuhi kewajiban hukum</li>
            </ul>
          </Section>

          <Section title="3. Berbagi Informasi">
            <SubTitle>3.1. Dengan Mitra Layanan</SubTitle>
            <p>Informasi Anda (nama, nomor telepon, dan lokasi) dibagikan kepada mitra yang menerima pesanan Anda untuk memfasilitasi layanan. Informasi ini hanya digunakan untuk keperluan penyelesaian pesanan.</p>
            <SubTitle>3.2. Dengan Penyedia Layanan Pihak Ketiga</SubTitle>
            <p>Kami bekerja sama dengan penyedia layanan seperti payment gateway dan layanan peta untuk mengoperasikan aplikasi.</p>
            <SubTitle>3.3. Kepatuhan Hukum</SubTitle>
            <p>Kami dapat mengungkapkan informasi Anda jika diwajibkan oleh hukum atau untuk melindungi hak dan keamanan kami.</p>
            <p style={{ fontWeight: 700, color: "#1a7a4a" }}>Kami TIDAK menjual informasi pribadi Anda kepada pihak ketiga untuk tujuan pemasaran.</p>
          </Section>

          <Section title="4. Keamanan Data">
            <p>Kami menerapkan langkah-langkah keamanan teknis dan organisasi untuk melindungi data Anda:</p>
            <ul>
              <li>Enkripsi data saat transmisi (HTTPS/SSL)</li>
              <li>Enkripsi kata sandi dengan algoritma hashing yang kuat</li>
              <li>Akses terbatas ke data pribadi oleh karyawan yang berwenang</li>
              <li>Monitoring sistem keamanan secara berkala</li>
            </ul>
          </Section>

          <Section title="5. Hak Anda">
            <p>Anda memiliki hak untuk:</p>
            <ul>
              <li>Mengakses dan memperbarui informasi pribadi Anda</li>
              <li>Menghapus akun dan data Anda (dengan ketentuan tertentu)</li>
              <li>Menolak pemrosesan data untuk tujuan tertentu</li>
              <li>Menarik persetujuan yang telah diberikan</li>
              <li>Mengajukan keluhan terkait pemrosesan data</li>
            </ul>
            <p>Untuk menggunakan hak-hak ini, silakan hubungi kami melalui email di <strong>support@rideindonesia.com</strong></p>
          </Section>

          <Section title="6. Penyimpanan Data">
            <p>Kami menyimpan data pribadi Anda selama akun Anda aktif atau selama diperlukan untuk menyediakan layanan. Data transaksi disimpan sesuai dengan persyaratan hukum yang berlaku di Indonesia (minimal 5 tahun untuk keperluan pajak dan audit).</p>
          </Section>

          <Section title="7. Cookie dan Teknologi Pelacakan">
            <p>Aplikasi Ride menggunakan cookie dan teknologi serupa untuk meningkatkan pengalaman pengguna, menganalisis penggunaan aplikasi, dan mengingat preferensi Anda. Anda dapat mengatur browser untuk menolak cookie, namun ini dapat memengaruhi fungsi aplikasi.</p>
          </Section>

          <Section title="8. Privasi Anak">
            <p>Layanan Ride ditujukan untuk pengguna berusia 17 tahun ke atas. Kami tidak dengan sengaja mengumpulkan informasi dari anak-anak di bawah umur. Jika Anda yakin kami telah mengumpulkan data dari anak di bawah umur, silakan hubungi kami segera.</p>
          </Section>

          <Section title="9. Perubahan Kebijakan">
            <p>Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan akan diposting di halaman ini dengan tanggal "Terakhir diperbarui" yang baru. Penggunaan berkelanjutan Anda atas layanan setelah perubahan berarti Anda menerima kebijakan yang diperbarui.</p>
          </Section>

          <Section title="10. Hubungi Kami">
            <p>Jika Anda memiliki pertanyaan tentang Kebijakan Privasi ini, silakan hubungi kami:</p>
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
