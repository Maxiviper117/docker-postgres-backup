import { $ } from "zx";
import dotenv from "dotenv";
dotenv.config();

const {
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  POSTGRES_DB
} = process.env;

if (!POSTGRES_HOST || !POSTGRES_PORT || !POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

async function wipeDb() {
  try {
    console.log(`Dropping database ${POSTGRES_DB}...`);
    await $`PGPASSWORD="${POSTGRES_PASSWORD}" dropdb -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} --if-exists ${POSTGRES_DB}`;
    console.log(`Creating database ${POSTGRES_DB}...`);
    await $`PGPASSWORD="${POSTGRES_PASSWORD}" createdb -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} ${POSTGRES_DB}`;
    console.log("Database wiped and recreated.");
  } catch (err) {
    console.error("Failed to wipe database:", err.stderr || err.message || err);
    process.exit(1);
  }
}

wipeDb();
