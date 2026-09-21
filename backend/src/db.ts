import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../database/migrations/001_init.sql",
);

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl:
    process.env.DATABASE_SSL === "false"
      ? false
      : databaseUrl().includes("localhost") ||
          databaseUrl().includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
});

export async function applySchema(): Promise<void> {
  const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
  await pool.query(sql);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
