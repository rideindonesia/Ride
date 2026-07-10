import { logger } from "./logger";

// OTP.id — penyedia OTP lokal (WhatsApp / SMS / Email). OTP.id yang mengelola
// pembuatan kode, pengiriman, kadaluarsa, dan anti-spam. Kita hanya memanggil
// /v2/send (dapat otp_id) lalu /v2/verify (otp_id + kode yang diketik user).
const OTPID_URL = "https://api.otp.id/v2";

/** Format nomor ke 62xxxx (tanpa +/0) sesuai yang diminta OTP.id. */
function toOtpIdNumber(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

export type OtpSendResult =
  | { ok: true; otpId: string }
  | { ok: false; error: string };

/**
 * Kirim OTP lewat OTP.id. Channel default WhatsApp (wa-long-number), bisa diubah
 * lewat env OTPID_CHANNEL (sms | wa-long-number | misscall). `destination` adalah
 * nomor HP tujuan.
 */
export async function sendOtp(
  destination: string,
  opts?: { channel?: string },
): Promise<OtpSendResult> {
  const apiKey = process.env.OTPID_API_KEY;
  if (!apiKey) {
    logger.error("OTPID_API_KEY tidak tersedia — OTP tidak dikirim");
    return { ok: false, error: "Layanan OTP belum dikonfigurasi. Hubungi admin." };
  }
  const channel = opts?.channel ?? process.env.OTPID_CHANNEL ?? "wa-long-number";
  const brand = process.env.OTPID_BRAND ?? "RIDE";

  try {
    const res = await fetch(`${OTPID_URL}/send`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: toOtpIdNumber(destination),
        otp_length: 6,
        brand,
        channel,
      }),
    });
    const data: any = await res.json().catch(() => null);
    const otpId = data?.data?.otp_id ?? data?.otp_id;
    if (!res.ok || !otpId) {
      logger.error({ status: res.status, data }, "OTP.id gagal mengirim OTP");
      return { ok: false, error: data?.message ?? "Gagal mengirim OTP, coba lagi" };
    }
    return { ok: true, otpId: String(otpId) };
  } catch (err) {
    logger.error({ err }, "Gagal memanggil OTP.id /send");
    return { ok: false, error: "Gagal mengirim OTP, coba lagi" };
  }
}

export type OtpVerifyResult = { ok: boolean; error?: string };

/** Verifikasi kode yang diketik user terhadap otp_id yang tersimpan. */
export async function verifyOtp(otpId: string, inputOtp: string): Promise<OtpVerifyResult> {
  const apiKey = process.env.OTPID_API_KEY;
  if (!apiKey) {
    logger.error("OTPID_API_KEY tidak tersedia — verifikasi gagal");
    return { ok: false, error: "Layanan OTP belum dikonfigurasi. Hubungi admin." };
  }

  try {
    const res = await fetch(`${OTPID_URL}/verify`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ otp_id: otpId, input_otp: inputOtp }),
    });
    const data: any = await res.json().catch(() => null);

    // Deteksi kegagalan eksplisit dari berbagai kemungkinan bentuk respons.
    const verified =
      data?.data?.verified === true ||
      data?.data?.status === "verified" ||
      data?.verified === true ||
      data?.success === true ||
      data?.status === true;
    const failed =
      data?.success === false ||
      data?.status === false ||
      data?.data?.verified === false ||
      !!data?.error;

    if (!res.ok || failed || !verified) {
      logger.warn({ status: res.status, data }, "OTP.id verify: kode ditolak");
      return { ok: false, error: data?.message ?? "Kode OTP tidak valid atau sudah kadaluarsa" };
    }
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Gagal memanggil OTP.id /verify");
    return { ok: false, error: "Gagal verifikasi OTP, coba lagi" };
  }
}
