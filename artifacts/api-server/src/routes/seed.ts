import { Router } from "express";
import { db, usersTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

const DEMO_PENGGUNA = [
  { name: "Demo Pengguna", phone: "+6281355446677", email: "demo.pengguna@ride.app", password: "demo1234", role: "pengguna" as const },
  { name: "Ahmad Rizki", phone: "+6281311112222", email: "ahmad.rizki@ride.app", password: "demo1234", role: "pengguna" as const },
  { name: "Sari Dewi", phone: "+6281333334444", email: "sari.dewi@ride.app", password: "demo1234", role: "pengguna" as const },
  { name: "Joko Susanto", phone: "+6281355556666", email: "joko.susanto@ride.app", password: "demo1234", role: "pengguna" as const },
];

const DEMO_MITRA = [
  { name: "Budi Santoso", phone: "+6281234567890", email: "budi.santoso@ride.app", password: "mitra1234", role: "mitra" as const, service: "bengkel" },
  { name: "Rudi Hermawan", phone: "+6282198765432", email: "rudi.hermawan@ride.app", password: "mitra1234", role: "mitra" as const, service: "etowing" },
  { name: "Doni Prasetyo", phone: "+6283188889999", email: "doni.prasetyo@ride.app", password: "mitra1234", role: "mitra" as const, service: "elektronik" },
  { name: "Anto Wijaya", phone: "+6285211223344", email: "anto.wijaya@ride.app", password: "mitra1234", role: "mitra" as const, service: "pangkas" },
  { name: "Wahyu Sanjaya", phone: "+6287812345678", email: "wahyu.sanjaya@ride.app", password: "mitra1234", role: "mitra" as const, service: "cuci_kendaraan" },
  { name: "Heru Gunawan", phone: "+6289934567890", email: "heru.gunawan@ride.app", password: "mitra1234", role: "mitra" as const, service: "inspeksi" },
];

router.post("/demo", async (_req, res) => {
  const all = [...DEMO_PENGGUNA, ...DEMO_MITRA];
  const results: { phone: string; status: string }[] = [];

  for (const u of all) {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, u.phone))
      .limit(1);

    if (existing.length > 0) {
      results.push({ phone: u.phone, status: "sudah ada" });
      continue;
    }

    await db.insert(usersTable).values({
      name: u.name,
      email: u.email,
      phone: u.phone,
      passwordHash: hashPassword(u.password),
      role: u.role,
    });
    results.push({ phone: u.phone, status: "dibuat" });
  }

  res.json({ message: "Seeding selesai", results });
});

// Seed historical orders for demo mitra accounts
router.post("/orders", async (_req, res) => {
  // Get user IDs
  const allUsers = await db.select({ id: usersTable.id, phone: usersTable.phone, role: usersTable.role }).from(usersTable);
  const userMap = Object.fromEntries(allUsers.map(u => [u.phone, u.id]));

  const budiId = userMap["+6281234567890"];
  const penggunaIds = [
    userMap["+6281355446677"],
    userMap["+6281311112222"],
    userMap["+6281333334444"],
    userMap["+6281355556666"],
  ].filter(Boolean);

  if (!budiId || penggunaIds.length === 0) {
    res.status(400).json({ error: "Demo users not seeded yet. Run /api/seed/demo first." });
    return;
  }

  // Check if orders already seeded
  const existingOrders = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.mitraId, budiId)).limit(1);
  if (existingOrders.length > 0) {
    res.json({ message: "Orders sudah ada", count: 0 });
    return;
  }

  function daysAgo(n: number, hours = 10): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hours, 0, 0, 0);
    return d;
  }

  function genOrderNo(): string {
    return "ORD" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  const historicalOrders = [
    // This week
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Avanza", vehicleYear: "2019", vehicleType: "mobil", damage: ["Mogok Total"], amount: 295000, days: 0 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda Beat", vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"], amount: 85000, days: 1 },
    { penggunaId: penggunaIds[2], vehicleModel: "Honda Jazz", vehicleYear: "2018", vehicleType: "mobil", damage: ["Aki Soak"], amount: 180000, days: 2 },
    // Last week
    { penggunaId: penggunaIds[3], vehicleModel: "Yamaha NMAX", vehicleYear: "2020", vehicleType: "motor", damage: ["Rantai Putus"], amount: 120000, days: 8 },
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Innova", vehicleYear: "2017", vehicleType: "mobil", damage: ["Overheat"], amount: 350000, days: 9 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda Vario", vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"], amount: 95000, days: 10 },
    { penggunaId: penggunaIds[2], vehicleModel: "Daihatsu Sigra", vehicleYear: "2019", vehicleType: "mobil", damage: ["Lampu Mati"], amount: 200000, days: 11 },
    { penggunaId: penggunaIds[3], vehicleModel: "Honda Scoopy", vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"], amount: 75000, days: 12 },
    { penggunaId: penggunaIds[0], vehicleModel: "Suzuki Ertiga", vehicleYear: "2020", vehicleType: "mobil", damage: ["Mogok Total", "Aki Soak"], amount: 380000, days: 13 },
    // 2 weeks ago
    { penggunaId: penggunaIds[1], vehicleModel: "Yamaha Aerox", vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"], amount: 110000, days: 16 },
    { penggunaId: penggunaIds[2], vehicleModel: "Toyota Agya", vehicleYear: "2020", vehicleType: "mobil", damage: ["Overheat"], amount: 220000, days: 17 },
    { penggunaId: penggunaIds[3], vehicleModel: "Honda BeAT", vehicleYear: "2019", vehicleType: "motor", damage: ["Rantai Putus", "Ban Bocor"], amount: 145000, days: 18 },
    { penggunaId: penggunaIds[0], vehicleModel: "Mitsubishi Xpander", vehicleYear: "2021", vehicleType: "mobil", damage: ["Mogok Total"], amount: 420000, days: 20 },
    // 3 weeks ago
    { penggunaId: penggunaIds[1], vehicleModel: "Honda CB150R", vehicleYear: "2020", vehicleType: "motor", damage: ["Aki Soak"], amount: 130000, days: 23 },
    { penggunaId: penggunaIds[2], vehicleModel: "Toyota Calya", vehicleYear: "2018", vehicleType: "mobil", damage: ["Lampu Mati", "Mogok Total"], amount: 310000, days: 24 },
    { penggunaId: penggunaIds[3], vehicleModel: "Yamaha Mio M3", vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"], amount: 80000, days: 25 },
    { penggunaId: penggunaIds[0], vehicleModel: "Daihatsu Xenia", vehicleYear: "2019", vehicleType: "mobil", damage: ["Overheat"], amount: 270000, days: 26 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda PCX", vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"], amount: 155000, days: 27 },
  ];

  let inserted = 0;
  for (const o of historicalOrders) {
    const fee = Math.round(o.amount * 0.15);
    const createdAt = daysAgo(o.days, 9 + Math.floor(Math.random() * 8));
    await db.insert(ordersTable).values({
      orderNo: genOrderNo(),
      penggunaId: o.penggunaId,
      mitraId: budiId,
      serviceType: "bengkel",
      vehicleType: o.vehicleType,
      vehicleModel: o.vehicleModel,
      vehicleYear: o.vehicleYear,
      damageCategories: o.damage,
      pickupAddress: "Balikpapan, Kalimantan Timur",
      status: "done",
      totalAmount: o.amount,
      platformFee: fee,
      rating: parseFloat((4.5 + Math.random() * 0.5).toFixed(1)),
      createdAt,
      updatedAt: createdAt,
    });
    inserted++;
    // small delay to avoid unique constraint issues on orderNo
    await new Promise(r => setTimeout(r, 5));
  }

  res.json({ message: "Orders berhasil di-seed", count: inserted });
});

// Seed 1 pending/incoming order for Budi to test notification
router.post("/incoming", async (_req, res) => {
  const allUsers = await db.select({ id: usersTable.id, phone: usersTable.phone }).from(usersTable);
  const userMap = Object.fromEntries(allUsers.map(u => [u.phone, u.id]));
  const budiId = userMap["+6281234567890"];
  const demoId = userMap["+6281355446677"];

  if (!budiId || !demoId) {
    res.status(400).json({ error: "Run /api/seed/demo first" });
    return;
  }

  const orderNo = "ORD" + Date.now().toString().slice(-8) + "INC";
  await db.insert(ordersTable).values({
    orderNo,
    penggunaId: demoId,
    mitraId: budiId,
    serviceType: "bengkel",
    vehicleType: "mobil",
    vehicleModel: "Toyota Avanza",
    vehicleYear: "2022",
    damageCategories: ["Mogok Total", "Aki Soak"],
    pickupAddress: "Jl. Jenderal Sudirman, Balikpapan",
    detailAlamat: "Depan Indomaret, dekat lampu merah",
    status: "pending",
    totalAmount: 275000,
    platformFee: 41250,
  });

  res.json({ message: "Incoming order berhasil dibuat", orderNo });
});

export default router;
