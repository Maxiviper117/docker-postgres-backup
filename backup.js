import {
    S3Client,
    PutObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { CronJob } from "cron";
import { $ } from "zx";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
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
    "AWS_SECRET_ACCESS_KEY"
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

// Ensure S3 bucket exists or create it
async function ensureBucketExists(bucketName) {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        // Bucket exists
    } catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
            // Bucket does not exist, create it
            await s3Client.send(
                new CreateBucketCommand({ Bucket: bucketName })
            );
            console.log(`Created S3 bucket: ${bucketName}`);
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

async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `backup-${timestamp}.sql`;
    const backupPath = path.join("/tmp", backupFileName);

    try {
        console.log(`Starting backup at ${timestamp}`);

        // Create PostgreSQL dump using zx
        await $`PGPASSWORD=\"${pg_config.password}\" pg_dump -h ${pg_config.host} -p ${pg_config.port} -U ${pg_config.user} -d ${pg_config.database} -f ${backupPath}`;
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

        // Clean up only after successful upload
        await $`rm ${backupPath}`;
        console.log("Temporary backup file cleaned up");
    } catch (error) {
        // Avoid logging sensitive info
        console.error("Backup failed:", error.message || error);
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

// Run initial backup and log result
(async () => {
    try {
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
