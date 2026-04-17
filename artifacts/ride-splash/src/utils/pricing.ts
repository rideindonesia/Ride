export let CALL_FEE_CONFIG: Record<string, { base: number; freeKm: number; perKm: number }> = {
  bengkel:    { base: 12000, freeKm: 3, perKm: 2500 },
  elektronik: { base: 12000, freeKm: 3, perKm: 2500 },
  barber:     { base: 12000, freeKm: 3, perKm: 2500 },
  cuci:       { base: 12000, freeKm: 3, perKm: 2500 },
  inspeksi:   { base: 20000, freeKm: 3, perKm: 3000 },
  towing:     { base: 75000, freeKm: 3, perKm: 8000 },
};

export let BIAYA_LAYANAN = 2000;
export let PLATFORM_FEE_PCT = 15;

let _tarifLoaded = false;

export async function loadTarif(apiBase: string = ""): Promise<void> {
  if (_tarifLoaded) return;
  try {
    const r = await fetch(`${apiBase}/api/pengguna/tarif`, { credentials: "include" });
    if (!r.ok) return;
    const { tarif } = await r.json() as { tarif: Record<string, string> };
    const freeKm = parseFloat(tarif["call_fee_free_km"] ?? "3") || 3;
    const biayaLayanan = parseInt(tarif["biaya_layanan_admin"] ?? "2000") || 2000;
    PLATFORM_FEE_PCT = parseInt(tarif["platform_fee_pct"] ?? "15") || 15;

    const map: Record<string, string> = {
      bengkel: "bengkel", elektronik: "elektronik", barber: "barber",
      cuci: "cuci", inspeksi: "inspeksi", towing: "towing",
    };

    const newCfg: typeof CALL_FEE_CONFIG = { ...CALL_FEE_CONFIG };
    for (const [svc, key] of Object.entries(map)) {
      const base = parseInt(tarif[`call_fee_${key}_base`] ?? "");
      const perKm = parseInt(tarif[`call_fee_${key}_per_km`] ?? "");
      if (!isNaN(base) && !isNaN(perKm)) {
        newCfg[svc] = { base, freeKm, perKm };
      }
    }
    CALL_FEE_CONFIG = newCfg;
    BIAYA_LAYANAN = biayaLayanan;
    _tarifLoaded = true;
  } catch {
  }
}

export function calcBiayaPanggilan(serviceType: string, distKm: number): number {
  const key = serviceType.toLowerCase().replace(/[\s_-]+/g, "");
  const cfg = CALL_FEE_CONFIG[key] ?? CALL_FEE_CONFIG.bengkel;
  const raw = cfg.base + Math.max(0, distKm - cfg.freeKm) * cfg.perKm;
  return Math.round(raw / 500) * 500;
}

export function trafficSpeedKmh(): number {
  const hour = new Date().getHours();
  if      (hour >= 7  && hour < 9)  return 15;
  else if (hour >= 11 && hour < 13) return 20;
  else if (hour >= 16 && hour < 19) return 12;
  else if (hour >= 19 && hour < 21) return 22;
  else                               return 28;
}

export function calcEtaMinutes(km: number): number {
  const speed = trafficSpeedKmh();
  const driveMin = (km / speed) * 60;
  return Math.max(5, Math.round(driveMin + 2));
}

export function calcEtaSecsLive(remainingKm: number, actualKmh?: number | null): number {
  const traffic = trafficSpeedKmh();
  let speed: number;
  if (actualKmh != null && actualKmh >= 2 && actualKmh <= 120) {
    speed = 0.6 * actualKmh + 0.4 * traffic;
  } else {
    speed = traffic;
  }
  const secs = (remainingKm / speed) * 3600;
  return Math.max(30, Math.round(secs));
}
