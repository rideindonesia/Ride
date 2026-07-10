import { logger } from "./logger";

// Fazpass — aggregator OTP (WhatsApp/SMS/Voice/Misscall dengan failover).
// Alur: POST /v1/otp/request → Fazpass yang BUAT & KIRIM kode (kode di-mask di
// respons), balikin data.id sebagai otp_id. Lalu POST /v1/otp/verify dengan
// { otp_id, otp } untuk memvalidasi kode yang diketik user.
const FAZPASS_URL = "https://api.fazpass.com/v1/otp";

/** Format nomor ke 62xxxx (tanpa +/0). */
function toPhone(phone: string): string {
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
 * Kirim OTP lewat Fazpass (/v1/otp/request). Channel/vendor ditentukan oleh
 * gateway_key yang dikonfigurasi di dashboard Fazpass (env FAZPASS_GATEWAY_KEY).
 */
export async function sendOtp(
  destination: string,
  _opts?: { channel?: string },
): Promise<OtpSendResult> {
  const key = process.env.FAZPASS_MERCHANT_KEY;
  const gatewayKey = process.env.FAZPASS_GATEWAY_KEY;
  if (!key || !gatewayKey) {
    logger.error(
      { hasMerchantKey: !!key, hasGatewayKey: !!gatewayKey },
      "Kredensial Fazpass tidak lengkap — OTP tidak dikirim",
    );
    return { ok: false, error: "Layanan OTP belum dikonfigurasi. Hubungi admin." };
  }

  try {
    const body: Record<string, unknown> = {
      phone: toPhone(destination),
      gateway_key: gatewayKey,
    };

    const res = await fetch(`${FAZPASS_URL}/request`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => null);
    const otpId = data?.data?.id;
    // Fazpass: status boolean true = sukses; pesan error di message.
    if (!res.ok || data?.status !== true || !otpId) {
      logger.error({ httpStatus: res.status, data }, "Fazpass gagal request OTP");
      return { ok: false, error: data?.message ?? "Gagal mengirim OTP, coba lagi" };
    }
    return { ok: true, otpId: String(otpId) };
  } catch (err) {
    logger.error({ err }, "Gagal memanggil Fazpass /request");
    return { ok: false, error: "Gagal mengirim OTP, coba lagi" };
  }
}

export type OtpVerifyResult = { ok: boolean; error?: string };

/** Verifikasi kode user terhadap otp_id (Fazpass /v1/otp/verify). */
export async function verifyOtp(otpId: string, inputOtp: string): Promise<OtpVerifyResult> {
  const key = process.env.FAZPASS_MERCHANT_KEY;
  if (!key) {
    logger.error("FAZPASS_MERCHANT_KEY tidak tersedia — verifikasi gagal");
    return { ok: false, error: "Layanan OTP belum dikonfigurasi. Hubungi admin." };
  }

  try {
    const res = await fetch(`${FAZPASS_URL}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ otp_id: otpId, otp: inputOtp }),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok || data?.status !== true) {
      logger.warn({ httpStatus: res.status, data }, "Fazpass verify: kode ditolak");
      return { ok: false, error: data?.message ?? "Kode OTP tidak valid atau sudah kadaluarsa" };
    }
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Gagal memanggil Fazpass /verify");
    return { ok: false, error: "Gagal verifikasi OTP, coba lagi" };
  }
}
