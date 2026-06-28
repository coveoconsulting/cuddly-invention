import crypto from "node:crypto";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const EMAIL = "commercial@coveoconsulting.com";
const NAME = "Commercial Coveo";
const PASSWORD = process.env.NEW_COMMERCIAL_PASSWORD || "Coveo@Commercial2026";

async function main() {
  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();
  if (!url) throw new Error("DATABASE_URL requis dans .env");

  const pool = new Pool({
    connectionString: url.replace(/([?&])channel_binding=require(&|$)/g, (_m, p, s) => (s === "&" ? p : "")),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const terr = await pool.query<{ id: string }>(`SELECT id FROM territories ORDER BY id ASC LIMIT 1`);
    const territoryId = terr.rows[0]?.id;
    if (!territoryId) throw new Error("Aucun territoire dans la base");

    const hash = hashPassword(PASSWORD);
    const id = "user-commercial";

    await pool.query(
      `INSERT INTO users (id, name, initials, email, phone, title, role, active, password_hash)
       VALUES ($1,$2,'CC',$3,'', 'Commercial terrain','sales_rep',TRUE,$4)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = 'sales_rep',
             active = TRUE,
             title = 'Commercial terrain'`,
      [id, NAME, EMAIL, hash],
    );

    const real = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [EMAIL]);
    const userId = real.rows[0].id;

    await pool.query(
      `INSERT INTO user_territories (user_id, territory_id, position)
       VALUES ($1,$2,0) ON CONFLICT (user_id, territory_id) DO NOTHING`,
      [userId, territoryId],
    );
    await pool.query(
      `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    console.log("OK  user:", userId, "| territory:", territoryId);
    const all = await pool.query<{ email: string; role: string; active: boolean }>(
      `SELECT email, role, active FROM users WHERE role = 'sales_rep' ORDER BY email`,
    );
    console.log("sales_rep accounts:", JSON.stringify(all.rows));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
