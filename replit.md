# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Aplikasi **RIDE — Super App Jasa Panggilan** dengan tiga jenis pengguna: **Pengguna**, **Mitra**, dan **Admin**.

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
- `/register/form?role=pengguna|mitra` — Form daftar

### API Endpoints yang Sudah Ada
- `GET  /api/healthz` — health check
- `POST /api/auth/register` — daftar akun baru
- `POST /api/auth/login` — masuk
- `GET  /api/auth/me` — cek sesi aktif
- `POST /api/auth/logout` — keluar

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
