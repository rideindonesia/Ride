import { logger } from "./logger";

const FONNTE_URL = "https://api.fonnte.com/send";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "62");
}

export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    logger.warn("FONNTE_TOKEN tidak tersedia, pesan WhatsApp tidak dikirim");
    return false;
  }

  const target = normalizePhone(phone);

  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target, message }),
    });
    const result = (await res.json()) as { status?: boolean; reason?: string };
    if (!result.status) {
      logger.error({ reason: result.reason }, "Fonnte gagal mengirim pesan");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Gagal kirim WhatsApp via Fonnte");
    return false;
  }
}
