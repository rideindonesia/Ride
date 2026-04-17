export const CALL_FEE_CONFIG: Record<string, { base: number; freeKm: number; perKm: number }> = {
  bengkel:    { base: 12000, freeKm: 3, perKm: 2500 },
  elektronik: { base: 12000, freeKm: 3, perKm: 2500 },
  barber:     { base: 12000, freeKm: 3, perKm: 2500 },
  cuci:       { base: 12000, freeKm: 3, perKm: 2500 },
  inspeksi:   { base: 20000, freeKm: 3, perKm: 3000 },
  towing:     { base: 75000, freeKm: 3, perKm: 8000 },
};

export const BIAYA_LAYANAN = 2000;

export function calcBiayaPanggilan(serviceType: string, distKm: number): number {
  const key = serviceType.toLowerCase().replace(/[\s_-]+/g, "");
  const cfg = CALL_FEE_CONFIG[key] ?? CALL_FEE_CONFIG.bengkel;
  const raw = cfg.base + Math.max(0, distKm - cfg.freeKm) * cfg.perKm;
  return Math.round(raw / 500) * 500;
}

/**
 * Estimasi waktu kedatangan mitra (menit) berdasarkan jarak dan kondisi lalu lintas.
 * Disesuaikan dengan tipikal kota Samarinda / Balikpapan.
 *
 * Kecepatan rata-rata per skenario:
 *  - Macet pagi  07:00–09:00  → ~15 km/h
 *  - Jam makan   11:30–13:00  → ~20 km/h
 *  - Macet sore  16:00–19:00  → ~12 km/h  (puncak terparah)
 *  - Mulai sepi  19:00–21:00  → ~22 km/h
 *  - Normal lain             → ~28 km/h
 *
 * +2 menit waktu mitra siap & berangkat.
 * Minimum 5 menit.
 */
export function calcEtaMinutes(km: number): number {
  const hour = new Date().getHours();
  let speedKmh: number;
  if      (hour >= 7  && hour < 9)  speedKmh = 15;
  else if (hour >= 11 && hour < 13) speedKmh = 20;
  else if (hour >= 16 && hour < 19) speedKmh = 12;
  else if (hour >= 19 && hour < 21) speedKmh = 22;
  else                               speedKmh = 28;

  const driveMin = (km / speedKmh) * 60;
  const prepMin  = 2;
  return Math.max(5, Math.round(driveMin + prepMin));
}
