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
 * Kecepatan rata-rata berdasarkan jam (model lalu lintas Samarinda/Balikpapan).
 */
export function trafficSpeedKmh(): number {
  const hour = new Date().getHours();
  if      (hour >= 7  && hour < 9)  return 15;
  else if (hour >= 11 && hour < 13) return 20;
  else if (hour >= 16 && hour < 19) return 12;
  else if (hour >= 19 && hour < 21) return 22;
  else                               return 28;
}

/**
 * ETA kedatangan mitra (menit) untuk kartu pesanan masuk.
 * Termasuk +2 menit persiapan, minimum 5 menit.
 */
export function calcEtaMinutes(km: number): number {
  const speed = trafficSpeedKmh();
  const driveMin = (km / speed) * 60;
  return Math.max(5, Math.round(driveMin + 2));
}

/**
 * ETA real-time saat mitra sudah berjalan (dalam detik).
 * Memadukan kecepatan GPS nyata dengan model lalu lintas:
 *   → 60% kecepatan aktual GPS + 40% model lalu lintas (tahan noise GPS)
 * Tidak ada waktu persiapan — mitra sudah bergerak.
 *
 * @param remainingKm - sisa jarak haversine mitra → pickup
 * @param actualKmh   - kecepatan GPS mitra saat ini (km/h), null jika tidak tersedia
 * @returns detik
 */
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
