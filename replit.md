# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Aplikasi **RIDE — Super App Jasa Panggilan** dengan tiga jenis pengguna: **Pengguna**, **Mitra**, dan **Admin**.

### Status Fitur
- **DashboardPengguna**: 4-tab bottom nav (Beranda/Pesanan/Chat/Akun) ✅
  - Akun tab FULL: Hero card (foto profil/level badge/stats) + Edit Profil lengkap (foto upload, nama, HP+OTP, email+OTP) + Aktivitas + Dompet & Pembayaran (RIDE Wallet balance+topup+withdraw+transaksi, Metode Pembayaran localStorage) + Voucher & Promo (voucher aktif + kode referral) + Preferensi (Alamat+Notifikasi) + Keamanan (ganti password) + Bantuan & Info + Keluar ✅
  - Riwayat Order: badge merah "Dibatalkan" + alasan pembatalan ditampilkan ✅
  - Rating & Review: modal bintang 1-5 + komentar, dikirim ke `/api/pengguna/orders/:id/review` ✅
  - Keluhan/Dispute per order: tombol "Laporkan Masalah" + modal, dikirim ke `/api/pengguna/reports` dengan orderId/orderNo ✅
- **DashboardMitra**: 4-tab bottom nav (Beranda/Pesanan/Chat/Akun) ✅
  - Akun tab: Hero profil card (nama, layanan, status verifikasi, stats) + Ringkasan Penghasilan + Dokumen & Verifikasi (dari DB) + Notifikasi toggles + Ganti password + Bantuan Mitra FAQ + Legal + Tentang + Keluar ✅
  - Riwayat Order: badge merah "Dibatalkan" + cancelReason ditampilkan + info dibatalkan oleh siapa ✅
  - Keluhan/Dispute per order: tombol "Laporkan Masalah" + modal, dikirim ke `/api/mitra/reports` dengan orderId/orderNo ✅
- **Tarif Dinamis**: `loadTarif(BASE)` di `pricing.ts` fetch `/api/pengguna/tarif` (dari system_settings DB) dan update `CALL_FEE_CONFIG` + `BIAYA_LAYANAN` saat runtime. Dipanggil di kedua dashboard ✅
- **Push Notifications**: `usePushNotification(true)` hook di kedua dashboard, sw.js handles push+notificationclick, VAPID web-push di backend push.ts ✅
- **Backend Pengguna**: GET+PUT /api/pengguna/profile, PUT /api/pengguna/change-password, POST /api/pengguna/request-profile-otp, POST /api/pengguna/verify-profile-otp, POST /api/pengguna/upload-photo (multer→/uploads/profile/), GET /api/pengguna/wallet, POST /api/pengguna/wallet/topup, POST /api/pengguna/wallet/withdraw, GET /api/pengguna/order-history (incl. cancelled), GET /api/pengguna/tarif, POST /api/pengguna/reports (with orderId/orderNo) ✅
- **Backend Mitra**: GET /api/mitra/profile-detail (docs status), PUT /api/mitra/change-password, GET /api/mitra/order-history (incl. cancelled), POST /api/mitra/reports (with orderId/orderNo) ✅
- **DB Schema**: profilePhotoPath + walletBalance di usersTable; walletTransactionsTable (topup/withdraw) ✅
- **Static uploads**: /uploads/* served dari api-server ✅
- **Socket.io (real-time)**: Singleton socket.ts (frontend), HTTP+Socket.io server (backend index.ts), identifySocket/joinOrderRoom/leaveOrderRoom utilities. Events: `order:new` (mitra broadcast), `order:accepted/phase/payment/done` (pengguna user room), `chat:message` (order room). DashboardPengguna, DashboardMitra, dan semua 6 Order pages (Bengkel/Cuci/Barber/Elektronik/Inspeksi/Towing) sudah socket-integrated. Polling direduksi ke 30s backup. ✅
- **Chat Auth (cross-role fix)**: `chat.ts` menggunakan `getAllUserIds()` yang mengumpulkan semua identitas (session + `ride-p-uid` cookie + `ride-m-uid` cookie) ke dalam Set, lalu memeriksa apakah ANY ID cocok dengan `penggunaId` atau `mitraId` order. Ini mengatasi bug di mana testing pada device yang sama (multiple account login) menyebabkan session dari pengguna lain mem-override autentikasi mitra dan memunculkan 403. ✅

## Admin Panel

URL: `/admin/` — Dibangun terpisah sebagai artifact react-vite di `artifacts/ride-admin/`, localPort 25116.

### Admin Account
| Email | Password |
|-------|----------|
| admin@ride.app | admin1234 |

> Akun admin dibuat dengan `isAdmin=true`, role='pengguna'. Seed via `POST /api/seed/admin`.
> Login lewat `/api/admin/login`, protected oleh session `adminId`.

### Halaman Admin Panel
1. **Dashboard** — Stats (order, pengguna, mitra, platform fee) + 4 chart (area, bar, pie, radar)
2. **Mitra** — List + filter status/search + detail modal + approve/reject/suspend
3. **Pengguna** — List + search + detail modal + suspend/aktifkan
4. **Order** — Monitoring real-time (refetch 15s) + filter status+layanan + detail + cancel
5. **Keuangan** — Summary bulan ini/lalu + fee per mitra tabel + MoM trend
6. **Voucher** — CRUD penuh (buat/edit/hapus/toggle aktif) — kartu grid
7. **Laporan** — Recharts: order per layanan, avg order value, distribusi fee pie, per kota, top 10 mitra
8. **Pengaturan** — Edit semua tarif (dari system_settings DB), buat admin baru, init admin default

### Backend Admin Routes
Semua di `/api/admin/*`, semua protected `requireAdmin` (session.adminId).
- `POST /admin/login` / `GET /admin/me` / `POST /admin/logout`
- `GET /admin/dashboard/stats` + 3 chart endpoints
- `GET/PATCH /admin/mitra` + status/suspend endpoints
- `GET/PATCH /admin/pengguna` + suspend endpoint
- `GET /admin/orders` + cancel endpoint
- `GET /admin/keuangan/summary` + fee-per-mitra
- `GET /admin/vouchers` + POST/PATCH/DELETE
- `GET /admin/laporan/by-service` + by-city + top-mitra
- `GET/PATCH /admin/settings`
- `GET/POST /admin/accounts` + change-password

### System Settings (DB table)
Semua tarif dibaca dari `system_settings` table, admin bisa edit via panel:
- `call_fee_{layanan}_base` / `call_fee_{layanan}_per_km` per 6 layanan
- `call_fee_free_km` = 3 (km gratis)
- `biaya_layanan_admin` = 2000 (dibayar pengguna)
- `platform_fee_pct` = 15 (% dari biaya panggilan → pendapatan platform)

## Demo Accounts

### Pengguna (User) — Password: `demo1234`
| Nama | Email |
|------|-------|
| Demo Pengguna | demo.pengguna@ride.app |
| Ahmad Rizki | ahmad.rizki@ride.app |

### Mitra (Service Provider) — Password: `mitra1234`
| Nama | Email | Layanan |
|------|-------|---------|
| Budi Santoso | budi.santoso@ride.app | Bengkel |
| Doni Prasetyo | doni.prasetyo@ride.app | Elektronik |
| Wahyu Sanjaya | wahyu.sanjaya@ride.app | Cuci Kendaraan |
| Anto Wijaya | anto.wijaya@ride.app | Barber (Pangkas) |
| Heru Gunawan | heru.gunawan@ride.app | Inspeksi |
| Rudi Hermawan | rudi.hermawan@ride.app | Towing / Derek |

> Seed via `POST /api/seed/demo` (akun + mitra_locations + mitra_applications)
> Seed orders via `POST /api/seed/orders` (18 historical orders untuk Budi Bengkel)

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

### Model Bisnis & Struktur Biaya (KRUSIAL — JANGAN DIUBAH)

**Biaya yang dibayar Pengguna ke Mitra:**
| Komponen | Keterangan |
|---|---|
| Biaya Panggilan | Biaya dasar + (biaya per km × jarak melebihi batas gratis) |
| Biaya Layanan & Admin | Flat **Rp 2.000** — selalu tetap |

**Tarif Biaya Panggilan per Layanan:**
| Layanan | Biaya Dasar | Gratis s/d | Per Km Lebih |
|---|---|---|---|
| Bengkel, Barber, Cuci, Elektronik | Rp 12.000 | 3 km | Rp 2.500/km |
| Inspeksi | Rp 20.000 | 3 km | Rp 3.000/km |
| Towing/Derek | Rp 75.000 | 3 km | Rp 8.000/km |

**Platform Fee yang dibayar Mitra ke RIDE (setelah order selesai):**
```
Platform Fee = (Biaya Panggilan × 15%) + Rp 2.000 (biaya layanan & admin)
```
Contoh: Bengkel jarak 5 km → Panggilan = Rp 12.000 + (2×Rp 2.500) = Rp 17.000 → Platform Fee = (Rp 17.000 × 15%) + Rp 2.000 = **Rp 4.550**

**Mitra menyimpan:** Biaya Jasa + Biaya Sparepart (jika ada)

> Implementasi: `PATCH /api/mitra/orders/:id/payment-data` → `platformFee = Math.round(callFee * 0.15) + layanan`
> Sumber tarif: `artifacts/ride-splash/src/utils/pricing.ts` (frontend) dan fungsi `serverCalcBiayaPanggilan` di `mitra.ts` (backend)

### Alur Pembayaran (Payment Flow)
- **Mitra side**: Form rincian biaya (biaya jasa + sparepart) di fase "selesai"; tombol "Kirim Rincian" → `PATCH /api/mitra/orders/:id/payment-data` + chat message; "Konfirmasi Pembayaran Selesai" → `PATCH /api/mitra/orders/:id/done`
- **Pengguna side (Step 5)**: 3 state: (1) Menunggu — paymentData null; (2) Rincian diterima — breakdown + kode voucher (RIDE10/RIDE20/GRATIS) + pilih metode bayar cash/transfer/QRIS + "Konfirmasi Pembayaran"; (3) Berhasil — Struk + Beri Ulasan
- **Auto-transition**: Polling step 4 deteksi `trackingPhase === "selesai"` → pindah ke step 5; `paymentData` juga dipoll tiap 4 detik
- **`paymentData` schema**: `{ biayaJasa, biayaSparepart, biayaPanggilan, biayaLayanan, total, paymentMethod }` disimpan sebagai JSON di kolom `payment_data` tabel `orders`
