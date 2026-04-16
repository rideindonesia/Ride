# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Aplikasi **RIDE — Super App Jasa Panggilan** dengan tiga jenis pengguna: **Pengguna**, **Mitra**, dan **Admin**.

### Status Fitur
- **DashboardPengguna**: 4-tab bottom nav (Beranda/Pesanan/Chat/Akun) ✅
  - Akun tab: Hero profil card (nama, email, phone, stats) + Edit nama + Ganti password + Voucher & Promo accordion + Notifikasi toggles + Alamat Tersimpan (localStorage) + Bantuan FAQ + Tentang/Syarat/Privasi + Keluar ✅
- **DashboardMitra**: 4-tab bottom nav (Beranda/Pesanan/Chat/Akun) ✅
  - Akun tab: Hero profil card (nama, layanan, status verifikasi, stats) + Ringkasan Penghasilan + Dokumen & Verifikasi (dari DB) + Notifikasi toggles + Ganti password + Bantuan Mitra FAQ + Legal + Tentang + Keluar ✅
- **Backend Pengguna**: GET+PUT /api/pengguna/profile, PUT /api/pengguna/change-password ✅
- **Backend Mitra**: GET /api/mitra/profile-detail (docs status), PUT /api/mitra/change-password ✅

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Wouter (routing) + TanStack Query

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Project Rules — WAJIB DIIKUTI

### Tidak Ada Hardcode
- **DILARANG** hardcode data apapun di frontend maupun backend
- Semua data (teks konten, konfigurasi bisnis, daftar layanan, harga, dsb.) harus dari database atau environment variable
- Tidak boleh ada data dummy, mock, atau placeholder yang ditampilkan ke pengguna nyata
- Semua nilai sensitif (secret, salt, key) wajib dari environment variable — tidak boleh ditulis langsung di kode

### Real-Time untuk Semua Peran
- Semua fitur harus bekerja real-time dari backend untuk ketiga peran: **Pengguna**, **Mitra**, dan **Admin**
- Tidak ada data statis yang seharusnya dinamis
- Setiap state yang ditampilkan di UI harus mencerminkan kondisi database saat itu

### Autentikasi & Sesi
- Password harus di-hash menggunakan `SESSION_SECRET` dari environment variable
- Sesi dikelola server-side menggunakan `express-session`
- Setiap endpoint yang butuh autentikasi wajib memvalidasi sesi

### API-First
- Semua fitur baru wajib didefinisikan di `lib/api-spec/openapi.yaml` terlebih dahulu
- Jalankan codegen setelah perubahan spec: `pnpm --filter @workspace/api-spec run codegen`
- Frontend menggunakan generated hooks dari `@workspace/api-client-react`

## Struktur Aplikasi

### Peran Pengguna
1. **Pengguna** — mencari dan memesan layanan jasa
2. **Mitra** — menerima order dan menghasilkan uang
3. **Admin** — mengelola seluruh sistem

### Halaman yang Sudah Ada
- `/` — Splash screen (cek sesi ke backend, redirect ke /login)
- `/login` — Pilih peran untuk masuk
- `/register` — Pilih peran untuk daftar
- `/login/form?role=pengguna|mitra` — Form login
- `/register/form?role=pengguna` — Form daftar Pengguna (3 langkah: form → OTP → sukses)
- `/register/form?role=mitra` — Form daftar Mitra (5 langkah: data diri → pilih layanan → dokumen → area operasi → sukses)

### API Endpoints yang Sudah Ada
- `GET  /api/healthz` — health check
- `POST /api/auth/register` — daftar akun baru (generic)
- `POST /api/auth/login` — masuk
- `GET  /api/auth/me` — cek sesi aktif
- `POST /api/auth/logout` — keluar
- `POST /api/pengguna/register` — daftar pengguna step 1 (kirim OTP)
- `POST /api/pengguna/verify-otp` — verifikasi OTP + buat akun pengguna
- `POST /api/pengguna/resend-otp` — kirim ulang OTP
- `POST /api/mitra/apply` — daftar mitra (multipart/form-data dengan file upload KTP, selfie, SIM, sertifikat)

### Tabel Database
- `users` — akun pengguna (id, name, email, phone, password_hash, role, created_at)
- `otp_codes` — kode OTP pendaftaran pengguna (phone, code, pending_data jsonb, expires_at, used)
- `mitra_applications` — pengajuan mitra (name, phone, email, password_hash, service_type, ktp_path, selfie_ktp_path, sim_path, cert_path, operating_city, status: pending/approved/rejected)

### Catatan Teknis
- File upload mitra disimpan di `artifacts/api-server/uploads/mitra/` menggunakan multer
- Daftar kota/kabupaten Indonesia (514 kota) ada di `artifacts/ride-splash/src/data/indonesian-cities.ts`
- OTP berlaku 5 menit, kode OTP dikembalikan di response (mode dev — ganti dengan SMS production)
- Password di-hash SHA256 + SESSION_SECRET

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

### Alur Pembayaran (Payment Flow)
- **Mitra side**: Form rincian biaya (biaya jasa + sparepart) di fase "selesai"; tombol "Kirim Rincian" → `PATCH /api/mitra/orders/:id/payment-data` + chat message; "Konfirmasi Pembayaran Selesai" → `PATCH /api/mitra/orders/:id/done`
- **Pengguna side (Step 5)**: 3 state: (1) Menunggu — paymentData null; (2) Rincian diterima — breakdown + kode voucher (RIDE10/RIDE20/GRATIS) + pilih metode bayar cash/transfer/QRIS + "Konfirmasi Pembayaran"; (3) Berhasil — Struk + Beri Ulasan
- **Auto-transition**: Polling step 4 deteksi `trackingPhase === "selesai"` → pindah ke step 5; `paymentData` juga dipoll tiap 4 detik
- **`paymentData` schema**: `{ biayaJasa, biayaSparepart, biayaPanggilan, biayaLayanan, total, paymentMethod }` disimpan sebagai JSON di kolom `payment_data` tabel `orders`
