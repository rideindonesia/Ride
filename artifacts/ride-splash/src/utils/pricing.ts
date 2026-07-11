export let CALL_FEE_CONFIG: Record<string, { base: number; freeKm: number; perKm: number }> = {
  bengkel:    { base: 12000, freeKm: 3, perKm: 2500 },
  elektronik: { base: 12000, freeKm: 3, perKm: 2500 },
  barber:     { base: 12000, freeKm: 3, perKm: 2500 },
  cuci:       { base: 12000, freeKm: 3, perKm: 2500 },
  inspeksi:   { base: 20000, freeKm: 3, perKm: 3000 },
  towing:     { base: 75000, freeKm: 3, perKm: 8000 },
  // Mobil (gocar): tarif flat nasional ≈ Maxim Car, sedikit lebih murah.
  // Biaya awal Rp4.000 + Rp3.800/km sejak km 0 (freeKm: 0).
  gocar:      { base: 4000,  freeKm: 0, perKm: 3800 },
};

// Verticals whose fare is based on the trip distance (pickup → destination),
// not the "mitra travels to you" call-fee model. These never get free km.
export const TRIP_SERVICES = new Set(["goride", "gocar", "gosend", "goshop", "gofood"]);

// Layanan berbasis kurir motor: tarif per ZONA (batas bawah Kemenhub KP 564/2022).
// goride (ride motor), gosend (antar barang), goshop (belanja ongkir), gofood (antar makanan ongkir).
// Semuanya berbagi satu tarif per zona; minimum menutup 4 km pertama (MOTOR_FREE_KM).
export const MOTOR_TRIP_SERVICES = new Set(["goride", "gosend", "goshop", "gofood"]);

// { base = tarif minimum (menutup MOTOR_FREE_KM pertama), perKm = per km berikutnya }
export let MOTOR_ZONE_CONFIG: Record<number, { base: number; perKm: number }> = {
  1: { base: 9000,  perKm: 1500 }, // Zona I  — Sumatra, Jawa (non-Jabodetabek), Bali
  2: { base: 10000, perKm: 2000 }, // Zona II — Jabodetabek
  3: { base: 9000,  perKm: 2000 }, // Zona III — Kalimantan, Sulawesi, NT, Maluku, Papua
};
export let MOTOR_FREE_KM = 4;

export function isTripService(serviceType: string): boolean {
  return TRIP_SERVICES.has(serviceType.toLowerCase().replace(/[\s_-]+/g, ""));
}

export function isMotorTripService(serviceType: string): boolean {
  return MOTOR_TRIP_SERVICES.has(serviceType.toLowerCase().replace(/[\s_-]+/g, ""));
}

// Tentukan zona tarif dari koordinat titik jemput. Batas geografis Indonesia (konstanta,
// bukan data bisnis) — nilai tarif tetap dari system_settings (bisa diedit admin).
export function zoneFromCoords(lat?: number | null, lng?: number | null): number {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return 3;
  // Zona II — Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi)
  if (lat >= -6.9 && lat <= -5.9 && lng >= 106.3 && lng <= 107.2) return 2;
  // Zona I — Bali
  if (lat >= -8.95 && lat <= -8.0 && lng >= 114.4 && lng <= 115.8) return 1;
  // Zona I — Jawa (non-Jabodetabek)
  if (lat >= -8.9 && lat <= -5.8 && lng >= 105.0 && lng <= 114.6) return 1;
  // Zona I — Sumatra
  if (lng >= 95.0 && lng <= 106.1 && lat >= -6.2 && lat <= 6.5) return 1;
  // Sisanya (Kalimantan, Sulawesi, NTB/NTT, Maluku, Papua) — Zona III
  return 3;
}

export let BIAYA_LAYANAN = 2000;
export let PLATFORM_FEE_PCT = 15;      // potongan mitra layanan jasa panggilan (on-site)
export let PLATFORM_FEE_PCT_TRIP = 5;  // potongan mitra layanan trip (motor/mobil/kurir)

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
    PLATFORM_FEE_PCT_TRIP = parseInt(tarif["platform_fee_pct_trip"] ?? "5") || 5;

    // On-site services + gocar (mobil) pakai CALL_FEE_CONFIG (per service).
    const newCfg: typeof CALL_FEE_CONFIG = { ...CALL_FEE_CONFIG };
    for (const svc of Object.keys(CALL_FEE_CONFIG)) {
      const base = parseInt(tarif[`call_fee_${svc}_base`] ?? "");
      const perKm = parseInt(tarif[`call_fee_${svc}_per_km`] ?? "");
      if (!isNaN(base) && !isNaN(perKm)) {
        // gocar (mobil) charge from km 0; on-site services grant free km.
        const svcFreeKm = svc === "gocar" ? 0 : freeKm;
        newCfg[svc] = { base, freeKm: svcFreeKm, perKm };
      }
    }
    CALL_FEE_CONFIG = newCfg;

    // Layanan kurir motor pakai tarif per zona.
    const newZone: typeof MOTOR_ZONE_CONFIG = { ...MOTOR_ZONE_CONFIG };
    for (const z of [1, 2, 3]) {
      const base = parseInt(tarif[`motor_zone${z}_base`] ?? "");
      const perKm = parseInt(tarif[`motor_zone${z}_per_km`] ?? "");
      if (!isNaN(base) && !isNaN(perKm)) newZone[z] = { base, perKm };
    }
    MOTOR_ZONE_CONFIG = newZone;
    const mFree = parseFloat(tarif["motor_free_km"] ?? "4");
    if (!isNaN(mFree)) MOTOR_FREE_KM = mFree;

    BIAYA_LAYANAN = biayaLayanan;
    _tarifLoaded = true;
  } catch {
  }
}

export function calcBiayaPanggilan(serviceType: string, distKm: number, zone: number = 3): number {
  const key = serviceType.toLowerCase().replace(/[\s_-]+/g, "");
  let raw: number;
  if (MOTOR_TRIP_SERVICES.has(key)) {
    // Kurir motor: tarif per zona, minimum menutup MOTOR_FREE_KM pertama.
    const cfg = MOTOR_ZONE_CONFIG[zone] ?? MOTOR_ZONE_CONFIG[3];
    raw = cfg.base + Math.max(0, distKm - MOTOR_FREE_KM) * cfg.perKm;
  } else {
    const cfg = CALL_FEE_CONFIG[key] ?? CALL_FEE_CONFIG.bengkel;
    raw = cfg.base + Math.max(0, distKm - cfg.freeKm) * cfg.perKm;
  }
  return Math.round(raw / 500) * 500;
}

// ── Jarak mengikuti jalan (OSRM) ─────────────────────────────────────────────
// Satu implementasi bersama untuk SEMUA layanan, supaya jarak (dan ETA/biaya
// yang mengikutinya) benar-benar mengikuti jalan — bukan garis lurus (haversine).
// Fallback ke haversine hanya bila OSRM gagal/timeout, agar UI tetap jalan.
function haversineKmLocal(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cache singkat berbasis koordinat (dibulatkan) supaya tidak menghajar OSRM
// untuk pasangan titik yang sama berulang kali (mis. polling status order).
const _roadCache = new Map<string, { km: number; at: number }>();
const ROAD_CACHE_TTL_MS = 60_000;

// Faktor "belok-belokan" jalan. Dipakai saat OSRM gagal supaya jarak yang dipakai untuk
// biaya/ETA/tampilan tidak pernah garis lurus mentah (yang lebih pendek dari jalan).
export const ROAD_DETOUR_FACTOR = 1.4;

// Estimasi jalan sinkron (garis lurus × faktor belok) — untuk fallback & placeholder,
// bukan garis lurus mentah.
export function roadEstimateKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKmLocal(lat1, lng1, lat2, lng2) * ROAD_DETOUR_FACTOR;
}

export async function roadDistanceKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): Promise<number> {
  // Koordinat tidak valid → jangan lempar; pakai estimasi jalan (0 jika benar-benar kosong).
  if (![lat1, lng1, lat2, lng2].every(n => typeof n === "number" && Number.isFinite(n))) {
    return roadEstimateKm(lat1 || 0, lng1 || 0, lat2 || 0, lng2 || 0);
  }
  const key = `${lat1.toFixed(4)},${lng1.toFixed(4)};${lat2.toFixed(4)},${lng2.toFixed(4)}`;
  const cached = _roadCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < ROAD_CACHE_TTL_MS) return cached.km;
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.ok) {
        const data: any = await res.json();
        const meters = data?.routes?.[0]?.distance;
        if (typeof meters === "number" && meters > 0) {
          const km = meters / 1000;
          _roadCache.set(key, { km, at: now });
          return km;
        }
      }
    } catch {
      /* retry lalu estimasi jalan */
    } finally {
      clearTimeout(timer);
    }
  }
  return roadEstimateKm(lat1, lng1, lat2, lng2);
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
