---
name: OTP provider (Fazpass)
description: RIDE's OTP send/verify runs on Fazpass; API contract, response shape, the short-expiry gotcha, and why OTP.id was dropped.
---

# OTP provider RIDE = Fazpass (aggregator WA/SMS/Voice/Misscall)

Semua OTP registrasi & profil lewat satu helper `artifacts/api-server/src/lib/fazpass.ts` (interface `sendOtp(dest)->{otpId}` & `verifyOtp(otpId,code)->{ok}`). Ganti provider = ganti helper ini saja; route di `pengguna.ts` tidak berubah.

## Kontrak API
- Base `https://api.fazpass.com/v1/otp`. Auth header `Authorization: Bearer <FAZPASS_MERCHANT_KEY>`.
- **request** (= kirim): `POST /request` body `{ phone, gateway_key }`. Fazpass yang BUAT & KIRIM kode (di-mask di respons). Sukses: `{"status":true,"data":{"id":"<otp_id>",...}}` — pakai `data.id` sebagai otp_id.
- **verify**: `POST /verify` body `{ otp_id, otp }`. Sukses: HTTP 200 `{"status":true,...}`. Gagal: HTTP 403 `{"status":false,"message":"OTP invalid","code":"4030201"}`.
- `status` di Fazpass **boolean** (true/false) — beda dgn OTP.id yang integer 1/0.
- Secrets: `FAZPASS_MERCHANT_KEY` (Bearer, akun-level) + `FAZPASS_GATEWAY_KEY` (per-channel, dari dashboard menu Integration → baris channel WhatsApp `WA_GENERIC_OTP` → tombol "Show Key"). Keduanya wajib di-set juga di Railway untuk prod.

## Gotcha: expiry pendek
- OTP Fazpass **cepat kadaluarsa** (hitungan menit). Verify kode yang benar tapi telat → HTTP 403 "OTP invalid" (bukan pesan "expired" khusus). Saat debug, terlihat seperti kode salah padahal hanya kadaluarsa. Tes cepat (kirim→verify dalam <1 menit) = sukses.
- Implikasi UX: alur registrasi harus tampilkan resend yang jelas; jangan bikin user lama sebelum input.

## Kenapa bukan OTP.id
- OTP.id (secret OTPID_API_KEY masih ada) API key valid & saldo terisi, TAPI `/v2/send` channel wa-long-number selalu gagal delivery (`status:0, rc:2, "There was an error when sending OTP"`, saldo tidak terpotong) — masalah provisioning akun OTP.id yang tak selesai. Ditinggalkan, pindah ke Fazpass yang langsung berhasil kirim+verify.

## Penyimpanan (tetap sama lintas provider)
- Kolom `otp_codes.code` menyimpan `otp_id` provider (bukan kode lokal). `pendingData` simpan name/email/passwordHash antara register→verify. verify-otp ambil record terakhir (unused, belum expired) by phone lalu panggil provider verify.
- Fonnte masih dipakai HANYA untuk notifikasi admin (approve/reject), bukan OTP.
