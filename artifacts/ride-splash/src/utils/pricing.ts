export let CALL_FEE_CONFIG: Record<string, { base: number; freeKm: number; perKm: number }> = {
  bengkel:    { base: 12000, freeKm: 3, perKm: 2500 },
  elektronik: { base: 12000, freeKm: 3, perKm: 2500 },
  barber:     { base: 12000, freeKm: 3, perKm: 2500 },
  cuci:       { base: 12000, freeKm: 3, perKm: 2500 },
  inspeksi:   { base: 20000, freeKm: 3, perKm: 3000 },
  towing:     { base: 75000, freeKm: 3, perKm: 8000 },
  // Gojek-style verticals: fare charged from km 0 (freeKm: 0) over trip distance A→B.
  goride:     { base: 5000,  freeKm: 0, perKm: 2000 },
  gocar:      { base: 10000, freeKm: 0, perKm: 4000 },
  gosend:     { base: 6000,  freeKm: 0, perKm: 2500 },
  goshop:     { base: 8000,  freeKm: 0, perKm: 2500 },
  gofood:     { base: 6000,  freeKm: 0, perKm: 2500 },
};

// Verticals whose fare is based on the trip distance (pickup → destination),
// not the "mitra travels to you" call-fee model. These never get free km.
export const TRIP_SERVICES = new Set(["goride", "gocar", "gosend", "goshop", "gofood"]);

export function isTripService(serviceType: string): boolean {
  return TRIP_SERVICES.has(serviceType.toLowerCase().replace(/[\s_-]+/g, ""));
}

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

    const newCfg: typeof CALL_FEE_CONFIG = { ...CALL_FEE_CONFIG };
    for (const svc of Object.keys(CALL_FEE_CONFIG)) {
      const base = parseInt(tarif[`call_fee_${svc}_base`] ?? "");
      const perKm = parseInt(tarif[`call_fee_${svc}_per_km`] ?? "");
      if (!isNaN(base) && !isNaN(perKm)) {
        // Trip-based verticals (goride/gocar/gosend/goshop/gofood) never get free km.
        const svcFreeKm = TRIP_SERVICES.has(svc) ? 0 : freeKm;
        newCfg[svc] = { base, freeKm: svcFreeKm, perKm };
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
