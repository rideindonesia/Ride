import { Router } from "express";
import { db, usersTable, ordersTable, mitraLocationsTable, mitraApplicationsTable, systemSettingsTable, merchantsTable, menuItemsTable, merchantApplicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

const DEMO_PENGGUNA = [
  { name: "Demo Pengguna",  phone: "+6281355446677", email: "demo.pengguna@ride.app",  password: "demo1234", role: "pengguna" as const },
  { name: "Ahmad Rizki",    phone: "+6281311112222", email: "ahmad.rizki@ride.app",    password: "demo1234", role: "pengguna" as const },
];

const DEMO_MITRA = [
  { name: "Budi Santoso",   phone: "+6281234567890", email: "budi.santoso@ride.app",   password: "mitra1234", role: "mitra" as const, service: "bengkel",    lat: -1.2584, lng: 116.8302 },
  { name: "Doni Prasetyo",  phone: "+6283188889999", email: "doni.prasetyo@ride.app",  password: "mitra1234", role: "mitra" as const, service: "elektronik", lat: -1.2704, lng: 116.8402 },
  { name: "Wahyu Sanjaya",  phone: "+6287812345678", email: "wahyu.sanjaya@ride.app",  password: "mitra1234", role: "mitra" as const, service: "cuci",       lat: -1.2504, lng: 116.8212 },
  { name: "Anto Wijaya",    phone: "+6285211223344", email: "anto.wijaya@ride.app",    password: "mitra1234", role: "mitra" as const, service: "barber",     lat: -1.2754, lng: 116.8312 },
  { name: "Heru Gunawan",   phone: "+6289934567890", email: "heru.gunawan@ride.app",   password: "mitra1234", role: "mitra" as const, service: "inspeksi",   lat: -1.2654, lng: 116.8452 },
  { name: "Rudi Hermawan",  phone: "+6282198765432", email: "rudi.hermawan@ride.app",  password: "mitra1234", role: "mitra" as const, service: "towing",     lat: -1.2554, lng: 116.8482 },
  { name: "Joko Riyanto",   phone: "+6281700000001", email: "joko.goride@ride.app",   password: "mitra1234", role: "mitra" as const, service: "goride",     lat: -1.2600, lng: 116.8300 },
  { name: "Slamet Widodo",  phone: "+6281700000002", email: "slamet.gocar@ride.app",  password: "mitra1234", role: "mitra" as const, service: "gocar",      lat: -1.2620, lng: 116.8320 },
  { name: "Eko Purnomo",    phone: "+6281700000003", email: "eko.gosend@ride.app",    password: "mitra1234", role: "mitra" as const, service: "gosend",     lat: -1.2580, lng: 116.8340 },
  { name: "Bayu Saputra",   phone: "+6281700000004", email: "bayu.goshop@ride.app",   password: "mitra1234", role: "mitra" as const, service: "goshop",     lat: -1.2640, lng: 116.8290 },
  { name: "Fajar Nugroho",  phone: "+6281700000005", email: "fajar.gofood@ride.app",  password: "mitra1234", role: "mitra" as const, service: "gofood",     lat: -1.2610, lng: 116.8310 },
];

const DEMO_MERCHANTS = [
  { name: "Warung Nasi Ibu Sari", ownerName: "Sari Wulandari", ownerEmail: "warung.sari@ride.app", ownerPhone: "+6281222000001", ownerPassword: "merchant1234", category: "food", description: "Masakan rumahan khas Balikpapan", address: "Jl. Ahmad Yani No. 12, Balikpapan", lat: -1.2620, lng: 116.8330, menu: [
    { name: "Nasi Ayam Goreng", price: 22000, category: "Makanan" },
    { name: "Nasi Rendang", price: 27000, category: "Makanan" },
    { name: "Soto Banjar", price: 20000, category: "Makanan" },
    { name: "Es Teh Manis", price: 5000, category: "Minuman" },
    { name: "Es Jeruk", price: 7000, category: "Minuman" },
  ]},
  { name: "Kedai Kopi Senja", ownerName: "Senja Pratama", ownerEmail: "warung.senja@ride.app", ownerPhone: "+6281222000002", ownerPassword: "merchant1234", category: "food", description: "Kopi & camilan", address: "Jl. Jenderal Sudirman No. 45, Balikpapan", lat: -1.2680, lng: 116.8280, menu: [
    { name: "Kopi Susu Gula Aren", price: 18000, category: "Minuman" },
    { name: "Americano", price: 15000, category: "Minuman" },
    { name: "Croissant Cokelat", price: 20000, category: "Camilan" },
    { name: "Kentang Goreng", price: 17000, category: "Camilan" },
  ]},
  { name: "Ayam Geprek Mantul", ownerName: "Mantul Wijaya", ownerEmail: "warung.mantul@ride.app", ownerPhone: "+6281222000003", ownerPassword: "merchant1234", category: "food", description: "Ayam geprek pedas level", address: "Jl. MT Haryono No. 8, Balikpapan", lat: -1.2560, lng: 116.8380, menu: [
    { name: "Geprek Original", price: 18000, category: "Makanan" },
    { name: "Geprek Keju", price: 23000, category: "Makanan" },
    { name: "Geprek Sambal Matah", price: 24000, category: "Makanan" },
    { name: "Es Teh", price: 5000, category: "Minuman" },
  ]},
];

router.post("/demo", async (_req, res) => {
  const all = [...DEMO_PENGGUNA, ...DEMO_MITRA];
  const results: { name: string; email: string; status: string }[] = [];

  for (const u of all) {
    // Check if user already exists
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, u.email))
      .limit(1);

    let userId: number;

    if (existing.length > 0) {
      userId = existing[0].id;
      await db.update(usersTable)
        .set({ passwordHash: hashPassword(u.password), phone: u.phone })
        .where(eq(usersTable.id, userId));
      results.push({ name: u.name, email: u.email, status: "password diperbarui" });
    } else {
      const [inserted] = await db.insert(usersTable).values({
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash: hashPassword(u.password),
        role: u.role,
      }).returning({ id: usersTable.id });
      userId = inserted.id;
      results.push({ name: u.name, email: u.email, status: "dibuat" });
    }

    // For mitra: seed mitra_locations and mitra_applications
    if (u.role === "mitra") {
      const mitraData = DEMO_MITRA.find(m => m.email === u.email)!;

      // Seed mitra_locations (online + koordinat Balikpapan)
      const existingLoc = await db.select({ id: mitraLocationsTable.id })
        .from(mitraLocationsTable)
        .where(eq(mitraLocationsTable.userId, userId))
        .limit(1);

      if (existingLoc.length === 0) {
        await db.insert(mitraLocationsTable).values({
          userId,
          lat: mitraData.lat,
          lng: mitraData.lng,
          isOnline: false,
          serviceType: mitraData.service,
        });
      } else {
        await db.update(mitraLocationsTable)
          .set({ lat: mitraData.lat, lng: mitraData.lng, serviceType: mitraData.service })
          .where(eq(mitraLocationsTable.userId, userId));
      }

      // Seed mitra_applications (approved, so profile-detail works)
      const existingApp = await db.select({ id: mitraApplicationsTable.id })
        .from(mitraApplicationsTable)
        .where(eq(mitraApplicationsTable.email, u.email))
        .limit(1);

      if (existingApp.length === 0) {
        await db.insert(mitraApplicationsTable).values({
          name: u.name,
          phone: u.phone,
          email: u.email,
          passwordHash: hashPassword(u.password),
          serviceType: mitraData.service,
          operatingCity: "Balikpapan",
          status: "approved",
        });
      }
    }
  }

  // Buat admin user jika belum ada
  const adminEmail = "admin@ride.app";
  const existingAdmin = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
  if (existingAdmin.length === 0) {
    await db.insert(usersTable).values({
      name: "Admin RIDE",
      email: adminEmail,
      phone: "+6281000000000",
      passwordHash: hashPassword("admin1234"),
      role: "pengguna",
      isAdmin: true,
    });
    results.push({ name: "Admin RIDE", email: adminEmail, status: "dibuat" });
  } else {
    await db.update(usersTable)
      .set({ passwordHash: hashPassword("admin1234"), isAdmin: true })
      .where(eq(usersTable.id, existingAdmin[0].id));
    results.push({ name: "Admin RIDE", email: adminEmail, status: "password diperbarui" });
  }

  // Seed demo merchants + akun login warung + menu (untuk GoFood)
  for (const m of DEMO_MERCHANTS) {
    // 1) Akun login warung (role 'merchant')
    const existingOwner = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, m.ownerEmail)).limit(1);
    let ownerUserId: number;
    if (existingOwner.length > 0) {
      ownerUserId = existingOwner[0].id;
      await db.update(usersTable)
        .set({ passwordHash: hashPassword(m.ownerPassword), phone: m.ownerPhone, role: "merchant" })
        .where(eq(usersTable.id, ownerUserId));
    } else {
      const [insUser] = await db.insert(usersTable).values({
        name: m.ownerName, email: m.ownerEmail, phone: m.ownerPhone,
        passwordHash: hashPassword(m.ownerPassword), role: "merchant",
      }).returning({ id: usersTable.id });
      ownerUserId = insUser.id;
    }

    // 2) Baris toko (merchants) — buat jika belum ada, dan pastikan ownerUserId ter-link
    const existingM = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.name, m.name)).limit(1);
    if (existingM.length > 0) {
      await db.update(merchantsTable)
        .set({ ownerUserId, phone: m.ownerPhone, operatingCity: "Balikpapan", status: "approved" })
        .where(eq(merchantsTable.id, existingM[0].id));
      // Pastikan lamaran warung ada & approved (agar tampil di admin)
      const existingApp = await db.select({ id: merchantApplicationsTable.id }).from(merchantApplicationsTable)
        .where(eq(merchantApplicationsTable.email, m.ownerEmail)).limit(1);
      if (existingApp.length === 0) {
        await db.insert(merchantApplicationsTable).values({
          ownerName: m.ownerName, phone: m.ownerPhone, email: m.ownerEmail,
          passwordHash: hashPassword(m.ownerPassword), shopName: m.name, category: m.category,
          description: m.description, address: m.address, lat: m.lat, lng: m.lng,
          operatingCity: "Balikpapan", status: "approved",
        });
      }
      results.push({ name: m.name, email: m.ownerEmail, status: "warung sudah ada (link owner)" });
      continue;
    }
    const [ins] = await db.insert(merchantsTable).values({
      ownerUserId, name: m.name, category: m.category, description: m.description,
      address: m.address, phone: m.ownerPhone, lat: m.lat, lng: m.lng,
      operatingCity: "Balikpapan", status: "approved", isOpen: true,
    }).returning({ id: merchantsTable.id });
    for (const item of m.menu) {
      await db.insert(menuItemsTable).values({
        merchantId: ins.id, name: item.name, price: item.price, category: item.category, isAvailable: true,
      });
    }
    // Lamaran warung approved (agar admin bisa melihat riwayat)
    const existingApp = await db.select({ id: merchantApplicationsTable.id }).from(merchantApplicationsTable)
      .where(eq(merchantApplicationsTable.email, m.ownerEmail)).limit(1);
    if (existingApp.length === 0) {
      await db.insert(merchantApplicationsTable).values({
        ownerName: m.ownerName, phone: m.ownerPhone, email: m.ownerEmail,
        passwordHash: hashPassword(m.ownerPassword), shopName: m.name, category: m.category,
        description: m.description, address: m.address, lat: m.lat, lng: m.lng,
        operatingCity: "Balikpapan", status: "approved",
      });
    }
    results.push({ name: m.name, email: m.ownerEmail, status: "warung + owner dibuat" });
  }

  res.json({ message: "Seeding selesai", results });
});

// Seed historical orders for demo mitra accounts
router.post("/orders", async (_req, res) => {
  const allUsers = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role }).from(usersTable);
  const userMap = Object.fromEntries(allUsers.map(u => [u.email, u.id]));

  const budiId = userMap["budi.santoso@ride.app"];
  const penggunaIds = [
    userMap["demo.pengguna@ride.app"],
    userMap["ahmad.rizki@ride.app"],
  ].filter(Boolean);

  if (!budiId || penggunaIds.length === 0) {
    res.status(400).json({ error: "Demo users not seeded yet. Run /api/seed/demo first." });
    return;
  }

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
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Avanza",       vehicleYear: "2019", vehicleType: "mobil", damage: ["Mogok Total"],              amount: 295000, days: 0  },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda Beat",           vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"],                 amount: 85000,  days: 1  },
    { penggunaId: penggunaIds[0], vehicleModel: "Honda Jazz",           vehicleYear: "2018", vehicleType: "mobil", damage: ["Aki Soak"],                  amount: 180000, days: 2  },
    { penggunaId: penggunaIds[1], vehicleModel: "Yamaha NMAX",          vehicleYear: "2020", vehicleType: "motor", damage: ["Rantai Putus"],              amount: 120000, days: 8  },
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Innova",        vehicleYear: "2017", vehicleType: "mobil", damage: ["Overheat"],                  amount: 350000, days: 9  },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda Vario",          vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"],               amount: 95000,  days: 10 },
    { penggunaId: penggunaIds[0], vehicleModel: "Daihatsu Sigra",       vehicleYear: "2019", vehicleType: "mobil", damage: ["Lampu Mati"],                amount: 200000, days: 11 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda Scoopy",         vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"],                 amount: 75000,  days: 12 },
    { penggunaId: penggunaIds[0], vehicleModel: "Suzuki Ertiga",        vehicleYear: "2020", vehicleType: "mobil", damage: ["Mogok Total", "Aki Soak"],   amount: 380000, days: 13 },
    { penggunaId: penggunaIds[1], vehicleModel: "Yamaha Aerox",         vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"],               amount: 110000, days: 16 },
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Agya",          vehicleYear: "2020", vehicleType: "mobil", damage: ["Overheat"],                  amount: 220000, days: 17 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda BeAT",           vehicleYear: "2019", vehicleType: "motor", damage: ["Rantai Putus", "Ban Bocor"], amount: 145000, days: 18 },
    { penggunaId: penggunaIds[0], vehicleModel: "Mitsubishi Xpander",   vehicleYear: "2021", vehicleType: "mobil", damage: ["Mogok Total"],               amount: 420000, days: 20 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda CB150R",         vehicleYear: "2020", vehicleType: "motor", damage: ["Aki Soak"],                  amount: 130000, days: 23 },
    { penggunaId: penggunaIds[0], vehicleModel: "Toyota Calya",         vehicleYear: "2018", vehicleType: "mobil", damage: ["Lampu Mati", "Mogok Total"], amount: 310000, days: 24 },
    { penggunaId: penggunaIds[1], vehicleModel: "Yamaha Mio M3",        vehicleYear: "2021", vehicleType: "motor", damage: ["Ban Bocor"],                 amount: 80000,  days: 25 },
    { penggunaId: penggunaIds[0], vehicleModel: "Daihatsu Xenia",       vehicleYear: "2019", vehicleType: "mobil", damage: ["Overheat"],                  amount: 270000, days: 26 },
    { penggunaId: penggunaIds[1], vehicleModel: "Honda PCX",            vehicleYear: "2022", vehicleType: "motor", damage: ["Mogok Total"],               amount: 155000, days: 27 },
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
    await new Promise(r => setTimeout(r, 5));
  }

  res.json({ message: "Orders berhasil di-seed", count: inserted });
});

// Seed 1 pending/incoming order for Budi to test notification
router.post("/incoming", async (_req, res) => {
  const allUsers = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
  const userMap = Object.fromEntries(allUsers.map(u => [u.email, u.id]));
  const budiId = userMap["budi.santoso@ride.app"];
  const demoId = userMap["demo.pengguna@ride.app"];

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

// POST /api/seed/admin — buat atau reset akun admin default
router.post("/admin", async (_req, res) => {
  const email = "admin@ride.app";
  const password = "admin1234";
  const salt = process.env.SESSION_SECRET;
  if (!salt) { res.status(500).json({ error: "SESSION_SECRET tidak ditemukan" }); return; }

  const { createHash } = await import("crypto");
  const passwordHash = createHash("sha256").update(password + salt).digest("hex");

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  let adminMsg: string;
  if (existing.length > 0) {
    await db.update(usersTable).set({ passwordHash, isAdmin: true }).where(eq(usersTable.email, email));
    adminMsg = "Password admin direset";
  } else {
    await db.insert(usersTable).values({
      name: "Super Admin", email, passwordHash, role: "pengguna", isAdmin: true,
    });
    adminMsg = "Admin berhasil dibuat";
  }

  // Upsert all system settings defaults (selalu dijalankan, idempotent)
  const settings = [
    { key: "call_fee_bengkel_base", value: "12000", label: "Bengkel — Biaya Dasar (Rp)" },
    { key: "call_fee_bengkel_per_km", value: "2500", label: "Bengkel — Per Km Lebih (Rp)" },
    { key: "call_fee_barber_base", value: "12000", label: "Barber — Biaya Dasar (Rp)" },
    { key: "call_fee_barber_per_km", value: "2500", label: "Barber — Per Km Lebih (Rp)" },
    { key: "call_fee_cuci_base", value: "12000", label: "Cuci — Biaya Dasar (Rp)" },
    { key: "call_fee_cuci_per_km", value: "2500", label: "Cuci — Per Km Lebih (Rp)" },
    { key: "call_fee_elektronik_base", value: "12000", label: "Elektronik — Biaya Dasar (Rp)" },
    { key: "call_fee_elektronik_per_km", value: "2500", label: "Elektronik — Per Km Lebih (Rp)" },
    { key: "call_fee_inspeksi_base", value: "20000", label: "Inspeksi — Biaya Dasar (Rp)" },
    { key: "call_fee_inspeksi_per_km", value: "3000", label: "Inspeksi — Per Km Lebih (Rp)" },
    { key: "call_fee_towing_base", value: "75000", label: "Towing — Biaya Dasar (Rp)" },
    { key: "call_fee_towing_per_km", value: "8000", label: "Towing — Per Km Lebih (Rp)" },
    // Mobil (gocar): flat nasional ≈ Maxim Car, sedikit lebih murah.
    { key: "call_fee_gocar_base", value: "4000", label: "Ride Mobil — Biaya Awal (Rp)" },
    { key: "call_fee_gocar_per_km", value: "3800", label: "Ride Mobil — Per Km (Rp)" },
    // Kurir motor (goride/gosend/goshop/gofood) — tarif per zona (batas bawah Kemenhub).
    { key: "motor_zone1_base", value: "8000", label: "Zona I — Tarif Minimum s/d 4 km (Rp)" },
    { key: "motor_zone1_per_km", value: "1600", label: "Zona I — Per Km berikutnya (Rp)" },
    { key: "motor_zone2_base", value: "9000", label: "Zona II (Jabodetabek) — Tarif Minimum s/d 4 km (Rp)" },
    { key: "motor_zone2_per_km", value: "2000", label: "Zona II (Jabodetabek) — Per Km berikutnya (Rp)" },
    { key: "motor_zone3_base", value: "8500", label: "Zona III — Tarif Minimum s/d 4 km (Rp)" },
    { key: "motor_zone3_per_km", value: "1800", label: "Zona III — Per Km berikutnya (Rp)" },
    { key: "motor_free_km", value: "4", label: "Kurir Motor — KM tercakup tarif minimum" },
    { key: "call_fee_free_km", value: "3", label: "Jarak Gratis Jasa Panggilan (km)" },
    { key: "biaya_layanan_admin", value: "2000", label: "Biaya Layanan & Admin (Rp)" },
    { key: "platform_fee_pct", value: "15", label: "Platform Fee Jasa Panggilan (%)" },
    { key: "platform_fee_pct_trip", value: "5", label: "Platform Fee Layanan Trip (%)" },
    { key: "belanja_max_talangan", value: "500000", label: "Belanja — Batas Maksimal Talangan (Rp)" },
  ];
  for (const s of settings) {
    await db.insert(systemSettingsTable).values(s).onConflictDoNothing();
  }

  res.json({ message: adminMsg, email, password, settingsSeeded: settings.length });
});

export default router;
