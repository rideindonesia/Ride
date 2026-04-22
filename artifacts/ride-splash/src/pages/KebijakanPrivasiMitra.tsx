import { useLocation } from "wouter";

export default function KebijakanPrivasiMitra() {
  const [, navigate] = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(-1 as any)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Kebijakan Privasi Mitra</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>Untuk Mitra Layanan RIDE</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", lineHeight: 1.7, color: "#2d3748" }}>

          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 16 }}>Terakhir diperbarui: 22 April 2026</div>

          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Ride ( PT. Alvi Utama Karya ) berkomitmen untuk melindungi privasi Anda sebagai mitra layanan. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi pribadi dan bisnis Anda saat bergabung dan beroperasi sebagai mitra di aplikasi Ride.
          </p>

          <Section title="1. Informasi yang Kami Kumpulkan">
            <SubTitle>1.1. Informasi Pribadi</SubTitle>
            <p>Kami mengumpulkan informasi yang Anda berikan saat mendaftar dan menjalankan layanan sebagai mitra:</p>
            <ul>
              <li>Nama lengkap</li>
              <li>Nomor telepon</li>
              <li>Alamat email</li>
              <li>Kata sandi (terenkripsi)</li>
              <li>Foto profil</li>
              <li>Foto KTP / identitas diri (untuk verifikasi)</li>
            </ul>
            <SubTitle>1.2. Informasi Bisnis dan Layanan</SubTitle>
            <ul>
              <li>Jenis layanan yang ditawarkan (bengkel, elektronik, cuci, barber, inspeksi, towing)</li>
              <li>Kota operasional</li>
              <li>Informasi rekening bank (untuk pencairan saldo/komisi)</li>
              <li>Portofolio atau foto layanan (jika tersedia)</li>
            </ul>
            <SubTitle>1.3. Informasi Lokasi</SubTitle>
            <p>Kami mengumpulkan dan memantau data lokasi real-time Anda selama sesi layanan aktif. Lokasi Anda ditampilkan kepada pengguna yang memesan layanan untuk memudahkan koordinasi. Di luar sesi aktif, lokasi Anda tidak dilacak.</p>
            <SubTitle>1.4. Informasi Kinerja</SubTitle>
            <ul>
              <li>Rating dan ulasan dari pengguna</li>
              <li>Riwayat pesanan yang diterima dan diselesaikan</li>
              <li>Tingkat penyelesaian pesanan</li>
              <li>Riwayat transaksi dan komisi</li>
            </ul>
            <SubTitle>1.5. Data Perangkat</SubTitle>
            <ul>
              <li>Jenis perangkat dan sistem operasi</li>
              <li>Alamat IP</li>
              <li>Log aktivitas aplikasi</li>
            </ul>
          </Section>

          <Section title="2. Penggunaan Informasi">
            <p>Kami menggunakan informasi Anda untuk:</p>
            <ul>
              <li>Memverifikasi identitas dan kelayakan Anda sebagai mitra</li>
              <li>Menampilkan profil Anda kepada pengguna yang mencari layanan</li>
              <li>Menghubungkan Anda dengan pengguna yang membutuhkan layanan terdekat</li>
              <li>Menghitung dan memproses komisi serta pencairan saldo</li>
              <li>Mengirim notifikasi pesanan, pembaruan layanan, dan informasi penting</li>
              <li>Mengelola sistem rating dan ulasan</li>
              <li>Mencegah penipuan dan aktivitas yang merugikan platform</li>
              <li>Menganalisis kinerja mitra untuk peningkatan layanan</li>
              <li>Mematuhi kewajiban hukum dan perpajakan</li>
            </ul>
          </Section>

          <Section title="3. Berbagi Informasi">
            <SubTitle>3.1. Dengan Pengguna (Konsumen)</SubTitle>
            <p>Informasi berikut ditampilkan secara publik kepada pengguna di dalam aplikasi untuk memfasilitasi pemesanan layanan:</p>
            <ul>
              <li>Nama lengkap</li>
              <li>Foto profil</li>
              <li>Jenis layanan</li>
              <li>Rating dan ulasan</li>
              <li>Lokasi real-time selama sesi layanan aktif</li>
            </ul>
            <p>Nomor telepon Anda hanya dibagikan kepada pengguna setelah pesanan dikonfirmasi, untuk keperluan koordinasi layanan.</p>
            <SubTitle>3.2. Dengan Penyedia Layanan Pihak Ketiga</SubTitle>
            <p>Kami bekerja sama dengan penyedia layanan seperti payment gateway, layanan peta, dan platform pengiriman OTP untuk mengoperasikan aplikasi.</p>
            <SubTitle>3.3. Dokumen Verifikasi</SubTitle>
            <p>Foto KTP dan dokumen verifikasi lainnya hanya digunakan untuk keperluan verifikasi identitas mitra dan tidak dibagikan kepada pengguna maupun pihak ketiga, kecuali diwajibkan oleh hukum.</p>
            <SubTitle>3.4. Kepatuhan Hukum dan Perpajakan</SubTitle>
            <p>Informasi transaksi dan komisi dapat digunakan untuk keperluan pelaporan pajak sesuai regulasi yang berlaku di Indonesia. Kami dapat mengungkapkan informasi Anda jika diwajibkan oleh otoritas hukum.</p>
            <p style={{ fontWeight: 700, color: "#1a7a4a" }}>Kami TIDAK menjual informasi pribadi Anda kepada pihak ketiga untuk tujuan pemasaran.</p>
          </Section>

          <Section title="4. Keamanan Data">
            <p>Kami menerapkan langkah-langkah keamanan teknis dan organisasi untuk melindungi data Anda:</p>
            <ul>
              <li>Enkripsi data saat transmisi (HTTPS/SSL)</li>
              <li>Enkripsi kata sandi dengan algoritma hashing yang kuat</li>
              <li>Penyimpanan dokumen verifikasi pada sistem yang terbatas aksesnya</li>
              <li>Akses terbatas ke data pribadi mitra oleh karyawan yang berwenang</li>
              <li>Monitoring sistem keamanan secara berkala</li>
              <li>Data rekening bank dienkripsi dan hanya digunakan untuk proses pencairan</li>
            </ul>
          </Section>

          <Section title="5. Hak Anda">
            <p>Sebagai mitra, Anda memiliki hak untuk:</p>
            <ul>
              <li>Mengakses dan memperbarui informasi pribadi dan bisnis Anda</li>
              <li>Meminta penghapusan akun dan data Anda (dengan ketentuan tertentu, termasuk penyelesaian kewajiban yang masih berjalan)</li>
              <li>Meminta salinan data Anda yang kami miliki</li>
              <li>Menolak pemrosesan data untuk tujuan tertentu</li>
              <li>Mengajukan keberatan atas rating atau ulasan yang tidak sesuai</li>
              <li>Mengajukan keluhan terkait pemrosesan data</li>
            </ul>
            <p>Untuk menggunakan hak-hak ini, silakan hubungi kami melalui email di <strong>mitra@rideindonesia.com</strong></p>
          </Section>

          <Section title="6. Penyimpanan Data">
            <p>Kami menyimpan data pribadi dan bisnis Anda selama akun mitra Anda aktif atau selama diperlukan untuk menyediakan layanan. Data transaksi dan komisi disimpan sesuai persyaratan hukum yang berlaku di Indonesia (minimal 5 tahun untuk keperluan pajak dan audit). Dokumen verifikasi disimpan selama akun aktif dan dihapus dalam 30 hari setelah penutupan akun, kecuali diwajibkan lain oleh hukum.</p>
          </Section>

          <Section title="7. Penghentian Kemitraan">
            <p>Jika kemitraan Anda dengan RIDE berakhir (baik atas permintaan Anda maupun keputusan RIDE), kami akan:</p>
            <ul>
              <li>Menghapus profil mitra Anda dari tampilan publik aplikasi</li>
              <li>Menyimpan data transaksi sesuai kewajiban hukum</li>
              <li>Memproses pencairan saldo yang tersisa sesuai ketentuan yang berlaku</li>
              <li>Menghapus dokumen verifikasi dalam 30 hari</li>
            </ul>
          </Section>

          <Section title="8. Privasi Anak">
            <p>Mitra RIDE harus berusia minimal 17 tahun dan memiliki identitas yang sah. Kami tidak menerima pendaftaran mitra dari individu di bawah umur.</p>
          </Section>

          <Section title="9. Perubahan Kebijakan">
            <p>Kami dapat memperbarui Kebijakan Privasi Mitra ini dari waktu ke waktu. Perubahan signifikan akan diberitahukan melalui notifikasi aplikasi atau email minimal 14 hari sebelum berlaku. Penggunaan berkelanjutan Anda atas platform setelah perubahan berarti Anda menerima kebijakan yang diperbarui.</p>
          </Section>

          <Section title="10. Hubungi Kami">
            <p>Jika Anda memiliki pertanyaan tentang Kebijakan Privasi Mitra ini, silakan hubungi kami:</p>
            <ul>
              <li><strong>Email:</strong> mitra@rideindonesia.com</li>
              <li><strong>Email Umum:</strong> support@rideindonesia.com</li>
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
