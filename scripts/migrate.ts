import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL (ou POSTGRES_URL) requis dans .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url.replace(/([?&])channel_binding=require(&|$)/g, (_m, p, s) => (s === "&" ? p : "")),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const dir = path.join(process.cwd(), "migrations");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    if (files.length === 0) {
      console.error("Aucune migration trouvée dans /migrations");
      process.exit(1);
    }

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const { rowCount } = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (rowCount && rowCount > 0) {
        console.log(`skip   ${version}`);
        continue;
      }
      const sql = await fs.readFile(path.join(dir, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        console.log(`apply  ${version}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log("OK");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
