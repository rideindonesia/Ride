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
            <p>Platform fee adalah biaya layanan & admin yang dipungut RIDE dari <strong>biaya panggilan</strong> per order yang berhasil diselesaikan. Fee ini merupakan kompensasi atas penyediaan teknologi, sistem pemesanan, dan dukungan pelanggan oleh RIDE.</p>
            <p style={{ marginTop: 8 }}>Biaya jasa dan sparepart sepenuhnya menjadi hak mitra — RIDE hanya mengambil fee dari biaya panggilan saja.</p>
          </Section>

          <Section title="2. Biaya Layanan & Admin (Biaya Panggilan)">
            <p>Biaya layanan & admin (biaya panggilan) adalah biaya yang <strong>ditetapkan oleh RIDE</strong> dan dikenakan kepada pengguna saat melakukan pemesanan. Biaya ini bukan bagian dari ongkos kerja mitra.</p>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 14, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 8 }}>Yang perlu diketahui mitra:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li style={{ marginBottom: 4 }}>Biaya panggilan ditetapkan dan ditampilkan oleh RIDE kepada pengguna</li>
                <li style={{ marginBottom: 4 }}>Mitra <strong>tidak perlu mengurus</strong> biaya panggilan — sudah dikelola otomatis oleh sistem</li>
                <li style={{ marginBottom: 4 }}>Platform fee 15% dihitung dari biaya panggilan ini secara otomatis</li>
                <li>Mitra dapat melihat rincian biaya panggilan per order di halaman riwayat transaksi</li>
              </ul>
            </div>
          </Section>

          <Section title="3. Biaya Jasa & Sparepart (Ditetapkan Mitra)">
            <p>Berbeda dengan biaya panggilan, <strong>biaya jasa dan sparepart ditetapkan sepenuhnya oleh mitra</strong> dan tidak melewati sistem RIDE. RIDE tidak mengatur, tidak menerima, dan tidak memberitahu pengguna mengenai besaran biaya ini — itu adalah urusan langsung antara mitra dan pengguna.</p>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 14, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 8 }}>Kewajiban Mitra:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li style={{ marginBottom: 4 }}>Wajib memberitahu pengguna estimasi biaya jasa sebelum pekerjaan dimulai</li>
                <li style={{ marginBottom: 4 }}>Wajib memberitahu biaya sparepart (jika ada) sebelum pemasangan</li>
                <li style={{ marginBottom: 4 }}>Tidak boleh menambahkan biaya di luar yang sudah disepakati tanpa persetujuan pengguna</li>
                <li>Seluruh biaya jasa dan sparepart dibayarkan langsung oleh pengguna kepada mitra</li>
              </ul>
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: "#7a8a9a" }}>Biaya jasa dan sparepart <strong>100% menjadi hak mitra</strong> dan tidak dipotong oleh RIDE.</p>
          </Section>

          <Section title="4. Besaran Platform Fee">
            <p>Platform fee ditetapkan sebesar <strong>15% dari biaya panggilan</strong> per order. Besaran ini dapat berubah dengan pemberitahuan minimal 14 hari sebelumnya.</p>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 14, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 6 }}>Yang Dikenakan Fee (15%):</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li>Biaya panggilan (biaya layanan & admin platform yang ditetapkan RIDE)</li>
              </ul>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginTop: 10, marginBottom: 6 }}>Yang TIDAK Dikenakan Fee (100% milik mitra):</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#065f46" }}>
                <li>Biaya jasa / ongkos kerja mitra</li>
                <li>Biaya sparepart / material tambahan</li>
                <li>Biaya perjalanan (jika disepakati terpisah)</li>
              </ul>
            </div>
          </Section>

          <Section title="5. Cara Penghitungan">
            <p>Penghitungan platform fee dilakukan secara otomatis oleh sistem saat order dinyatakan selesai:</p>
            <div style={{ background: "#f8faff", borderRadius: 12, padding: 14, marginTop: 10, fontFamily: "monospace" }}>
              <div style={{ fontSize: 12, color: "#2563eb", marginBottom: 8 }}>Contoh Perhitungan:</div>
              <div style={{ fontSize: 12, color: "#1a2a3a", lineHeight: 2 }}>
                Biaya panggilan (ditetapkan RIDE) : Rp 50.000<br />
                Platform fee 15%                  : Rp 7.500<br />
                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
                  Pendapatan mitra dari panggilan   : Rp 42.500
                </div>
              </div>
            </div>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 12, marginTop: 10, border: "1px solid #d1fae5", fontSize: 12, color: "#065f46" }}>
              <strong>Biaya jasa & sparepart terpisah, langsung dari pengguna ke mitra:</strong><br />
              Biaya jasa mitra (ditetapkan mitra) : Rp 150.000 → 100% mitra<br />
              Biaya sparepart (ditetapkan mitra)  : Rp 80.000 → 100% mitra
            </div>
          </Section>

          <Section title="6. Alur Pembayaran">
            <p>Mitra <strong>menerima pembayaran langsung dari pengguna</strong>. RIDE tidak menahan atau memproses uang pembayaran dari pengguna.</p>
            <div style={{ background: "#f0faf8", borderRadius: 12, padding: 14, marginTop: 10, border: "1px solid #d1fae5" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#065f46", marginBottom: 8 }}>Alur Pembayaran per Order:</div>
              <div style={{ fontSize: 12, color: "#065f46", lineHeight: 2 }}>
                <div>① Pengguna membayar langsung ke mitra</div>
                <div style={{ paddingLeft: 12, color: "#6b7280", fontSize: 11 }}>→ Biaya panggilan + biaya jasa + sparepart (jika ada)</div>
                <div>② Mitra menyisihkan platform fee (15% dari biaya panggilan)</div>
                <div style={{ paddingLeft: 12, color: "#6b7280", fontSize: 11 }}>→ Dibayarkan ke RIDE sesuai periode tagihan</div>
                <div>③ Sisanya 100% milik mitra</div>
                <div style={{ paddingLeft: 12, color: "#6b7280", fontSize: 11 }}>→ Biaya jasa + sparepart + 85% biaya panggilan</div>
              </div>
            </div>
          </Section>

          <Section title="7. Periode & Pembayaran Platform Fee">
            <SubTitle>7.1. Periode Tagihan</SubTitle>
            <ul>
              <li>Platform fee diakumulasi per order yang berhasil diselesaikan</li>
              <li>Tagihan direkap setiap periode yang ditentukan (mingguan atau bulanan)</li>
              <li>Mitra dapat melihat rincian tagihan di halaman riwayat transaksi</li>
              <li>Tagihan yang belum dilunasi ditampilkan sebagai tagihan aktif di aplikasi</li>
            </ul>
            <SubTitle>7.2. Cara Pembayaran ke RIDE</SubTitle>
            <ul>
              <li>Pembayaran platform fee dilakukan oleh mitra ke RIDE via transfer bank atau metode lain yang ditentukan</li>
              <li>Detail rekening dan metode pembayaran tersedia di halaman tagihan aplikasi</li>
            </ul>
            <SubTitle>7.3. Batas Waktu Pembayaran</SubTitle>
            <ul>
              <li>Platform fee harus dilunasi sesuai tanggal jatuh tempo di tagihan</li>
              <li>Keterlambatan dapat mengakibatkan pembatasan sementara pada akun mitra</li>
              <li>Tunggakan melebihi batas waktu yang ditentukan dapat mengakibatkan penonaktifan akun</li>
            </ul>
          </Section>

          <Section title="8. Program Mitra Unggulan">
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

          <Section title="9. Perubahan Kebijakan Komisi">
            <p>RIDE berhak mengubah besaran platform fee dan ketentuan komisi kapan saja. Perubahan akan diberitahukan melalui notifikasi aplikasi dan/atau email minimal <strong>14 hari</strong> sebelum berlaku. Penggunaan platform setelah perubahan berlaku dianggap sebagai persetujuan atas kebijakan baru.</p>
          </Section>

          <Section title="10. Penyelesaian Sengketa Komisi">
            <p>Jika Anda menemukan ketidaksesuaian dalam perhitungan komisi atau tagihan:</p>
            <ul>
              <li>Ajukan keberatan dalam 7 hari setelah tagihan diterbitkan</li>
              <li>Kirim detail order yang bermasalah ke email mitra@rideindonesia.com</li>
              <li>Tim RIDE akan meninjau dan memberikan respons dalam 3 hari kerja</li>
            </ul>
          </Section>

          <Section title="11. Hubungi Kami">
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
