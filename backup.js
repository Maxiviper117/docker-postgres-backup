import {
    S3Client,
    PutObjectCommand,
    HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { CronJob } from "cron";
import { $ } from "zx";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import pkg from "pg";
import "dotenv/config";
const { Client } = pkg;
dotenv.config();

// Validate required environment variables
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
];
const missing = requiredEnv.filter((v) => !process.env[v]);
if (missing.length) {
    console.error(
        `Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
}

const s3_config = {
    aws_region: process.env.AWS_REGION,
    s3_endpoint: process.env.S3_ENDPOINT,
    s3_bucket: process.env.S3_BUCKET,
    s3_prefix: process.env.S3_PREFIX,
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
};

// S3 client configuration
const s3Client = new S3Client({
    region: s3_config.aws_region,
    endpoint: s3_config.s3_endpoint,
    forcePathStyle: true,
    credentials: {
        accessKeyId: s3_config.aws_access_key_id,
        secretAccessKey: s3_config.aws_secret_access_key,
    },
});

// Ensure S3 bucket exists
async function ensureBucketExists(bucketName) {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        // Bucket exists
    } catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
            // Bucket does not exist, throw error with instruction
            throw new Error(
                `S3 bucket '${bucketName}' does not exist. Please create the bucket manually in your S3 provider before running this backup. (Expected bucket name from env: ${bucketName})`
            );
        } else {
            // Other error
            throw err;
        }
    }
}

const pg_config = {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
};

const backupRetentionDays = parseInt(
    process.env.BACKUP_RETENTION_DAYS || "0",
    30
); // default to 30 days
const initialBackupDelay = parseInt(
    process.env.STARTUP_BACKUP_DELAY_SEC || "60",
    0
); // default to 60 seconds
async function deleteOldBackups() {
    if (
        !backupRetentionDays ||
        isNaN(backupRetentionDays) ||
        backupRetentionDays <= 0
    ) {
        return; // No retention policy set
    }
    const { ListObjectsV2Command, DeleteObjectCommand } = await import(
        "@aws-sdk/client-s3"
    );
    const prefix = process.env.S3_PREFIX || "";
    const now = Date.now();
    const retentionMs = backupRetentionDays * 24 * 60 * 60 * 1000;
    let ContinuationToken = undefined;
    do {
        const listParams = {
            Bucket: process.env.S3_BUCKET,
            Prefix: prefix,
            ContinuationToken,
        };
        const listResp = await s3Client.send(
            new ListObjectsV2Command(listParams)
        );
        if (listResp.Contents) {
            for (const obj of listResp.Contents) {
                if (!obj.Key) continue;
                // Expect backup-YYYY-MM-DDTHH-MM-SS-SSSZ.sql
                const match = obj.Key.match(
                    /backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sql/
                );
                if (match) {
                    const backupDate = new Date(
                        match[1]
                            .replace(/-/g, ":")
                            .replace(
                                /T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/,
                                "T$1:$2:$3.$4Z"
                            )
                    );
                    if (now - backupDate.getTime() > retentionMs) {
                        await s3Client.send(
                            new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET,
                                Key: obj.Key,
                            })
                        );
                        console.log(`Deleted old backup from S3: ${obj.Key}`);
                    }
                }
            }
        }
        ContinuationToken = listResp.IsTruncated
            ? listResp.NextContinuationToken
            : undefined;
    } while (ContinuationToken);
}

async function createBackup() {
    // Check S3 and PostgreSQL connections before proceeding
    const s3Ok = await checkS3Connection();

    console.log("S3 connection check: ", s3Ok ? "OK" : "Failed");
    const pgOk = await checkPostgresConnection();
    if (!s3Ok || !pgOk) {
        console.error("Aborting backup: One or more connection checks failed.");
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `backup-${timestamp}.sql`;
    const backupPath = path.join("/tmp", backupFileName);

    try {
        console.log(`Starting backup at ${timestamp}`);

        // Create PostgreSQL dump using zx
        await $`PGPASSWORD=\"${pg_config.password}\" pg_dump -h ${pg_config.host} -p ${pg_config.port} -U ${pg_config.user} -d ${pg_config.database} -F c -f ${backupPath}`;
        console.log("Database dump created successfully");

        // Upload to S3
        const fileContent = fs.readFileSync(backupPath);
        const uploadParams = {
            Bucket: process.env.S3_BUCKET,
            Key: `${process.env.S3_PREFIX || ""}${backupFileName}`,
            Body: fileContent,
        };
        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log(`Backup uploaded to S3: ${uploadParams.Key}`);

        // Verify the backup
        const isValid = await verifyBackup(backupFileName, backupPath);
        if (!isValid) {
            throw new Error("Backup verification failed");
        }

        // Delete old backups if retention is set
        await deleteOldBackups();

        // Clean up only after successful verification
        await $`rm ${backupPath}`;
        console.log("Temporary backup file cleaned up");
    } catch (error) {
        // Avoid logging sensitive info
        console.error("Backup failed:", error.message || error);
    }
}

// Check S3 connection by ensuring the bucket is accessible
async function checkS3Connection() {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: s3_config.s3_bucket }));
        console.log("S3 connection check: Success");
        return true;
    } catch (err) {
        console.error("S3 connection check failed:", err.message || err);
        return false;
    }
}

// Check PostgreSQL connection by connecting and running a simple query
async function checkPostgresConnection() {
    const client = new Client({
        host: pg_config.host,
        port: pg_config.port,
        user: pg_config.user,
        password: pg_config.password,
        database: pg_config.database,
    });
    try {
        await client.connect();
        await client.query("SELECT 1;");
        console.log("PostgreSQL connection check: Success");
        return true;
    } catch (err) {
        console.error("PostgreSQL connection check failed:", err.message || err);
        return false;
    } finally {
        await client.end();
    }
}

async function verifyBackup(backupFileName, backupPath) {
    try {
        console.log(`Verifying backup: ${backupFileName}`);

        // Check if local file exists and is not empty
        const fileStats = fs.statSync(backupPath);
        if (fileStats.size === 0) {
            throw new Error("Backup file is empty");
        }

        // For custom format backups, use pg_restore --list to verify
        await $`pg_restore --list ${backupPath}`;
        console.log("Backup file format verification passed");

        // Verify the file was uploaded to S3 correctly
        const s3Key = `${process.env.S3_PREFIX || ""}${backupFileName}`;
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const s3Object = await s3Client.send(
            new GetObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: s3Key,
            })
        );

        // Compare local and S3 file sizes
        const s3FileSize = s3Object.ContentLength;
        if (s3FileSize !== fileStats.size) {
            throw new Error(
                `S3 file size (${s3FileSize}) does not match local backup size (${fileStats.size})`
            );
        }

        console.log("Backup verification completed successfully");
        return true;
    } catch (error) {
        console.error("Backup verification failed:", error.message);
        return false;
    }
}

async function checkPostgresVersion() {
    const client = new Client({
        host: pg_config.host,
        port: pg_config.port,
        user: pg_config.user,
        password: pg_config.password,
        database: pg_config.database,
    });
    try {
        await client.connect();
        const res = await client.query("SHOW server_version;");
        const versionString =
            res.rows[0].server_version ||
            res.rows[0].server_version_num ||
            res.rows[0].server_version_full ||
            Object.values(res.rows[0])[0];
        // Accepts 16, 16.x, 16.x.x, etc
        const major = versionString.split(".")[0];
        if (major !== "16") {
            console.error(
                `ERROR: Connected PostgreSQL server version is ${versionString}, but only v16 is supported.`
            );
            process.exit(1);
        } else {
            console.log(
                `Connected to PostgreSQL server version ${versionString} (OK)`
            );
        }
    } catch (err) {
        console.error(
            "Failed to check PostgreSQL version:",
            err.message || err
        );
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Start cron job
const job = new CronJob(
    process.env.BACKUP_SCHEDULE || "0 0 * * *", // Default to daily at midnight
    createBackup,
    null,
    true,
    "UTC"
);

console.log("Backup scheduler started");
console.log(`Next backup scheduled for: ${job.nextDates()}`);

// Ensure S3 bucket exists
await ensureBucketExists(s3_config.s3_bucket);

// Explicitly check S3 connection at startup and log result
const s3StartupOk = await checkS3Connection();
console.log("S3 connection check at startup:", s3StartupOk ? "OK" : "Failed");
if (!s3StartupOk) {
    console.error("ERROR: Could not connect to S3 at startup. Exiting.");
    process.exit(1);
}

// Run version check before anything else
await checkPostgresVersion();

// Run initial backup and log result
(async () => {
    try {
        if (initialBackupDelay > 0) {
            console.log(
                `Initial backup will be delayed by ${initialBackupDelay} seconds.`
            );
            await new Promise((resolve) =>
                setTimeout(resolve, initialBackupDelay * 1000)
            );
        }
        await createBackup();
        console.log("Initial backup on startup completed");
    } catch (err) {
        console.error("Initial backup on startup failed:", err);
    }
})();

// Listen for termination signals to gracefully stop the script
process.on("SIGINT", () => {
    console.log("Received SIGINT. Exiting...");
    job.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("Received SIGTERM. Exiting...");
    job.stop();
    process.exit(0);
});
