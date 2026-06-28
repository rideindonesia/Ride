export default function SyaratKetentuanMitra() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "'Inter', sans-serif", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #eef2f7", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, color: "#1a2a3a" }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a3a" }}>Syarat & Ketentuan Mitra</div>
          <div style={{ fontSize: 11, color: "#9aa5b4" }}>Perjanjian Kemitraan RIDE</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", lineHeight: 1.7, color: "#2d3748" }}>

          <div style={{ fontSize: 11, color: "#9aa5b4", marginBottom: 16 }}>Terakhir diperbarui: 22 April 2026</div>

          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Dengan mendaftar sebagai mitra RIDE, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan kemitraan berikut. Perjanjian ini berlaku sejak akun mitra Anda disetujui dan aktif di platform.
          </p>

          <Section title="1. Definisi">
            <ul>
              <li><strong>RIDE / Platform</strong> — Aplikasi layanan panggilan yang dikelola oleh PT. Alvi Utama Karya</li>
              <li><strong>Mitra</strong> — Penyedia layanan independen yang terdaftar dan disetujui di platform RIDE</li>
              <li><strong>Pengguna / Konsumen</strong> — Individu yang memesan layanan melalui aplikasi RIDE</li>
              <li><strong>Order / Pesanan</strong> — Permintaan layanan dari pengguna yang diterima oleh mitra</li>
              <li><strong>Platform Fee / Komisi</strong> — Persentase yang dipotong oleh RIDE dari biaya panggilan setiap order</li>
              <li><strong>Saldo</strong> — Pendapatan mitra setelah dikurangi platform fee yang tersimpan di akun RIDE</li>
            </ul>
          </Section>

          <Section title="2. Persyaratan Menjadi Mitra">
            <p>Untuk bergabung sebagai mitra RIDE, Anda harus memenuhi persyaratan berikut:</p>
            <ul>
              <li>Berusia minimal 17 tahun dan memiliki identitas diri yang sah (KTP)</li>
              <li>Memiliki keahlian dan/atau peralatan yang relevan dengan jenis layanan yang ditawarkan</li>
              <li>Memiliki nomor telepon aktif yang terhubung dengan WhatsApp</li>
              <li>Berdomisili atau beroperasi di wilayah yang dilayani RIDE (saat ini Balikpapan dan sekitarnya)</li>
              <li>Menyetujui proses verifikasi identitas yang dilakukan oleh tim RIDE</li>
              <li>Tidak sedang menjalani sanksi hukum yang dapat memengaruhi kemampuan memberikan layanan</li>
            </ul>
          </Section>

          <Section title="3. Kewajiban Mitra">
            <SubTitle>3.1. Standar Layanan</SubTitle>
            <ul>
              <li>Memberikan layanan secara profesional, jujur, dan sesuai standar kualitas RIDE</li>
              <li>Hadir di lokasi pengguna sesuai estimasi waktu yang disepakati</li>
              <li>Menggunakan peralatan yang layak dan aman untuk keperluan layanan</li>
              <li>Berpakaian rapi dan bersikap sopan kepada pengguna</li>
              <li>Menjaga kebersihan lokasi kerja setelah layanan selesai</li>
            </ul>
            <SubTitle>3.2. Komunikasi</SubTitle>
            <ul>
              <li>Merespons permintaan pesanan dalam waktu yang wajar</li>
              <li>Memberitahukan pengguna jika terjadi keterlambatan atau kendala</li>
              <li>Berkomunikasi secara profesional dan tidak menggunakan bahasa yang tidak pantas</li>
            </ul>
            <SubTitle>3.3. Kejujuran Harga</SubTitle>
            <ul>
              <li>Memberikan estimasi biaya yang jujur dan transparan sebelum pekerjaan dimulai</li>
              <li>Tidak menambahkan biaya tersembunyi di luar yang telah disepakati</li>
              <li>Biaya sparepart (jika ada) harus dikomunikasikan dan disetujui pengguna terlebih dahulu</li>
            </ul>
          </Section>

          <Section title="4. Sistem Komisi dan Pembayaran">
            <SubTitle>4.1. Platform Fee</SubTitle>
            <p>RIDE memotong platform fee dari biaya panggilan (bukan biaya sparepart atau biaya jasa tambahan) setiap kali order selesai. Besaran platform fee berlaku sesuai ketentuan yang tercantum di halaman kebijakan komisi dalam aplikasi.</p>
            <SubTitle>4.2. Pencairan Saldo</SubTitle>
            <ul>
              <li>Saldo hasil layanan dapat dicairkan sesuai ketentuan pencairan yang berlaku</li>
              <li>Mitra wajib mendaftarkan rekening bank yang aktif dan valid untuk pencairan</li>
              <li>RIDE tidak bertanggung jawab atas kesalahan pencairan akibat data rekening yang tidak akurat</li>
            </ul>
            <SubTitle>4.3. Perubahan Fee</SubTitle>
            <p>RIDE berhak mengubah besaran platform fee dengan pemberitahuan minimal 14 hari sebelumnya melalui notifikasi aplikasi atau email.</p>
          </Section>

          <Section title="5. Penerimaan dan Penolakan Order">
            <ul>
              <li>Mitra bebas menerima atau menolak pesanan yang masuk</li>
              <li>Penolakan pesanan berulang kali tanpa alasan yang jelas dapat memengaruhi peringkat mitra</li>
              <li>Setelah pesanan diterima, mitra wajib menyelesaikan layanan kecuali ada alasan mendesak yang sah</li>
              <li>Pembatalan pesanan oleh mitra setelah dikonfirmasi harus disertai alasan yang valid dan dikomunikasikan kepada pengguna</li>
              <li>Pembatalan berulang oleh mitra dapat mengakibatkan penangguhan sementara atau permanen</li>
            </ul>
          </Section>

          <Section title="6. Rating, Ulasan, dan Performa">
            <ul>
              <li>Pengguna berhak memberikan rating (1–5 bintang) dan ulasan setelah layanan selesai</li>
              <li>Rating mitra dihitung secara rata-rata dari seluruh ulasan yang diterima</li>
              <li>Mitra dengan rating di bawah ambang batas minimum yang ditentukan RIDE dapat dinonaktifkan sementara</li>
              <li>Mitra tidak diperbolehkan meminta atau menekan pengguna untuk memberikan rating tertentu</li>
              <li>Mitra dapat mengajukan keberatan atas ulasan yang tidak sesuai fakta melalui layanan pelanggan RIDE</li>
            </ul>
          </Section>

          <Section title="7. Larangan Mitra">
            <p>Mitra dilarang untuk:</p>
            <ul>
              <li>Memberikan layanan yang tidak sesuai atau tidak kompeten di bidang yang didaftarkan</li>
              <li>Meminta pembayaran di luar sistem RIDE atau mengajak transaksi langsung untuk menghindari platform fee</li>
              <li>Membawa pihak lain ke lokasi pengguna tanpa sepengetahuan dan persetujuan pengguna</li>
              <li>Memanfaatkan akses ke lokasi pengguna untuk tujuan di luar layanan yang dipesan</li>
              <li>Melecehkan, mengancam, atau berlaku tidak sopan kepada pengguna</li>
              <li>Memberikan ulasan palsu kepada sesama mitra</li>
              <li>Memiliki lebih dari satu akun mitra aktif</li>
              <li>Menggunakan aplikasi untuk kegiatan yang melanggar hukum</li>
            </ul>
          </Section>

          <Section title="8. Keamanan dan Keselamatan">
            <ul>
              <li>Mitra wajib menjaga keselamatan diri dan pengguna selama proses layanan berlangsung</li>
              <li>Mitra dilarang bekerja dalam kondisi tidak fit (pengaruh alkohol, obat-obatan, atau kondisi fisik yang membahayakan)</li>
              <li>Mitra bertanggung jawab atas keamanan peralatan yang dibawa ke lokasi pengguna</li>
              <li>Jika terjadi situasi berbahaya, mitra berhak menghentikan layanan dan melaporkan kepada RIDE</li>
            </ul>
          </Section>

          <Section title="9. Penangguhan dan Penghapusan Akun Mitra">
            <p>RIDE berhak menangguhkan sementara atau menghapus permanen akun mitra jika:</p>
            <ul>
              <li>Melanggar syarat dan ketentuan kemitraan</li>
              <li>Menerima laporan pelanggaran yang terbukti dari pengguna</li>
              <li>Rating terus menerus di bawah standar minimum yang ditetapkan</li>
              <li>Terbukti melakukan penipuan, baik terhadap pengguna maupun platform</li>
              <li>Melakukan transaksi di luar platform secara sengaja dan berulang</li>
              <li>Terlibat dalam aktivitas ilegal yang berkaitan dengan penggunaan platform</li>
            </ul>
            <p>Mitra yang akunnya dihapus dapat mengajukan banding kepada tim RIDE dalam 14 hari sejak pemberitahuan.</p>
          </Section>

          <Section title="10. Penghentian Kemitraan">
            <p>Mitra dapat mengakhiri kemitraan kapan saja dengan menghubungi tim RIDE. Syarat penghentian:</p>
            <ul>
              <li>Semua pesanan yang sedang berjalan harus diselesaikan terlebih dahulu</li>
              <li>Saldo yang tersisa akan dicairkan sesuai prosedur pencairan dalam 14 hari kerja</li>
              <li>Data profil mitra akan dihapus dari tampilan publik setelah kemitraan berakhir</li>
            </ul>
          </Section>

          <Section title="11. Perubahan Ketentuan">
            <p>RIDE berhak mengubah Syarat & Ketentuan Kemitraan ini sewaktu-waktu. Perubahan signifikan akan diberitahukan melalui notifikasi aplikasi atau email minimal 14 hari sebelum berlaku. Kelanjutan penggunaan platform setelah perubahan dianggap sebagai persetujuan atas ketentuan baru.</p>
          </Section>

          <Section title="12. Hukum yang Berlaku">
            <p>Perjanjian kemitraan ini tunduk pada hukum yang berlaku di Republik Indonesia. Segala sengketa diselesaikan secara musyawarah, dan jika tidak tercapai kesepakatan, akan diselesaikan melalui jalur hukum di Indonesia.</p>
          </Section>

          <Section title="13. Hubungi Kami">
            <p>Untuk pertanyaan terkait kemitraan:</p>
            <ul>
              <li><strong>Email Mitra:</strong> mitra@rideindonesia.com</li>
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
