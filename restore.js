import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { $ } from "zx";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

// Required env vars
const requiredEnv = [
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "AWS_REGION",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_RESTORE_FILE"
];
const missing = requiredEnv.filter((v) => !process.env[v]);
if (missing.length) {
    console.error(
        `Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function downloadBackupFromS3() {
    const s3Key = (process.env.S3_PREFIX || "") + process.env.S3_RESTORE_FILE;
    const localPath = path.join("/tmp", path.basename(s3Key));
    try {
        console.log(`Downloading backup from S3: ${s3Key}`);
        const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
        });
        const data = await s3Client.send(command);
        const writeStream = fs.createWriteStream(localPath);
        await new Promise((resolve, reject) => {
            data.Body.pipe(writeStream);
            data.Body.on("error", reject);
            writeStream.on("finish", resolve);
        });
        console.log(`Downloaded backup to: ${localPath}`);
        return localPath;
    } catch (err) {
        console.error("Failed to download backup from S3:", err.message);
        process.exit(1);
    }
}

async function restoreDatabase(backupPath) {
    try {
        console.log("Restoring database from backup...");
        await $`PGPASSWORD="${process.env.POSTGRES_PASSWORD}" pg_restore -h ${process.env.POSTGRES_HOST} -p ${process.env.POSTGRES_PORT} -U ${process.env.POSTGRES_USER} -d ${process.env.POSTGRES_DB} ${backupPath}`;
        console.log("Database restore completed successfully.");
    } catch (err) {
        console.error("Database restore failed:", err.stderr || err.message || err);
        process.exit(1);
    }
}

async function dropAndRecreateDatabase() {
    const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
    // Use a different database for admin commands to avoid dropping the current connection
    const adminDb = POSTGRES_DB === "postgres" ? "template1" : "postgres";
    try {
        console.log(`Dropping database ${POSTGRES_DB} if it exists...`);
        await $`PGPASSWORD="${POSTGRES_PASSWORD}" psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d ${adminDb} -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";"`;
        console.log(`Creating database ${POSTGRES_DB}...`);
        await $`PGPASSWORD="${POSTGRES_PASSWORD}" psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d ${adminDb} -c "CREATE DATABASE \"${POSTGRES_DB}\";"`;
        console.log(`Database ${POSTGRES_DB} created.`);
    } catch (err) {
        console.error("Failed to drop and recreate database:", err.stderr || err.message || err);
        process.exit(1);
    }
}

(async () => {
    const backupPath = await downloadBackupFromS3();
    await dropAndRecreateDatabase();
    await restoreDatabase(backupPath);
})();
