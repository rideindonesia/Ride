import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: dbUrl });
export const db = drizzle(pool, { schema });

// Idempotent additive migrations applied at startup so new columns exist on
// every environment (local dev + Railway prod) without a separate migrate step.
export async function ensureSchema(): Promise<void> {
  // express-session store table (connect-pg-simple). Created here because the
  // store's own `createTableIfMissing` reads a bundled table.sql via __dirname,
  // which does not survive the esbuild server bundle.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`,
  );
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_prefs jsonb NOT NULL DEFAULT '{}'::jsonb`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      url text,
      category text,
      read boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id, read)`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS login_history (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      role text NOT NULL,
      ip_address text,
      user_agent text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history (user_id, created_at)`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_addresses (
      id serial PRIMARY KEY,
      pengguna_id integer NOT NULL,
      label text NOT NULL,
      address text NOT NULL,
      lat double precision,
      lng double precision,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS user_addresses_pengguna_idx ON user_addresses (pengguna_id)`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS voucher_usage (
      id serial PRIMARY KEY,
      pengguna_id integer NOT NULL,
      voucher_id integer,
      code text NOT NULL,
      order_id integer,
      order_no text,
      discount integer NOT NULL DEFAULT 0,
      used_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS voucher_usage_pengguna_idx ON voucher_usage (pengguna_id, used_at)`,
  );
}

export * from "./schema";
