---
name: OTP.id integration
description: How RIDE calls OTP.id for OTP send/verify, its response shape, valid channels, and the account-provisioning gotcha.
---

# OTP.id (penyedia OTP lokal) — dipakai RIDE menggantikan Fonnte untuk OTP

- Endpoints: `POST https://api.otp.id/v2/send` dan `.../v2/verify`. Header auth: `x-api-key: <OTPID_API_KEY>` (secret; juga harus di-set di Railway untuk prod).
- send body: `{ number, otp_length, brand, channel }`. verify body: `{ otp_id, input_otp }`.
- `number` format: `62xxxxxxxx` (tanpa `+`/`0` di depan).

## Bentuk respons (PENTING — bukan boolean)
- Top-level `status` adalah **integer**: `1` = sukses, `0` = gagal. Jangan cek `=== true/false`.
- Pesan error di field `error_msg` (kadang juga `message`/`note`), bukan `error`/`message` saja.
- send sukses: `otp_id` ada di `data.otp_id`. send gagal: `{"data":{...,"status":"failed","note":"There was an error when sending OTP..."},"rc":2,"status":0}`.
- Channel tidak dikenal → `{"error_msg":"Channel : xxx Not Found","status":0}`.

## Channel valid untuk akun "Ride Indonesia"
- Hanya `wa-long-number` dan `misscall` yang dikenali. `sms`, `wa`, `whatsapp` → "Channel Not Found".
- Default yang dipakai kode: `wa-long-number` (override via env `OTPID_CHANNEL`; brand via `OTPID_BRAND`, default "RIDE").

## Gotcha provisioning (blocker per 2026-07-10)
- Meski API key valid & channel dikenali, `wa-long-number` DAN `misscall` gagal kirim: `status:0, rc:2, note:"There was an error when sending OTP, please try again"`, saldo tidak berkurang (last_balance tetap 10000).
- Ini **bukan bug kode** — request format sudah benar (semua variasi payload sama gagalnya). Delivery gagal di sisi OTP.id: butuh aktivasi sender/brand di dashboard OTP.id atau hubungi CS OTP.id. Tes end-to-end tertunda sampai user menyelesaikan setup akun OTP.id.

## Penyimpanan
- Kolom `otp_codes.code` di-repurpose menyimpan `otp_id` dari OTP.id (bukan kode lokal). `pendingData` tetap simpan name/email/passwordHash antara register→verify. verify-otp ambil record terakhir (belum used, belum expired) by phone lalu panggil OTP.id verify.
- Fonnte tetap dipakai HANYA untuk notifikasi admin (approve/reject), bukan OTP.
