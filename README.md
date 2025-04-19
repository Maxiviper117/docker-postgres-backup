# Docker Postgres Backup

**Note: This version is compatible only with PostgreSQL 16.**

A simple Node.js utility to automate PostgreSQL database backups and upload them to S3-compatible storage (e.g., AWS S3, MinIO). Runs as a Docker container and supports scheduled backups via cron.

## Features
- Scheduled PostgreSQL backups using cron
- Uploads backups to S3-compatible storage
- Configurable via environment variables
- Automatic bucket creation (optional)

## Usage

### 1. Build the Docker image

```sh
docker build -t postgres-backup .
```

### 2. Set up environment variables

Create a `.env` file or pass variables via `docker run`/`docker-compose`:

```
# =========================
# PostgreSQL Configuration
# =========================
POSTGRES_HOST=your_postgres_host # use host.docker.internal for Docker on Windows/Mac if backing up db on same machine in a container
POSTGRES_PORT=5432
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=your_postgres_db
POSTGRES_URI=postgresql://your_postgres_user:your_postgres_password@your_postgres_host:5432/your_postgres_db
# =========================
# AWS S3 Configuration
# =========================
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
S3_BUCKET=your_s3_bucket
S3_PREFIX=your_s3_prefix
S3_ENDPOINT=http://localhost:9000 
# =========================
# Configurations
# =========================
BACKUP_SCHEDULE="0 0 * * *"
BACKUP_RETENTION_DAYS=30

```

### 3. Run the container

```sh
docker run --env-file .env postgres-backup
```

Or with Docker Compose (see `docker-compose.yml`):

```sh
docker-compose up
```

## How it works
- On startup, an immediate backup is performed.
- A cron job schedules recurring backups.
- Each backup is uploaded to the specified S3 bucket/prefix.

## Restoring a backup
1. Download the desired `.sql` file from your S3 bucket.
2. Restore using `psql`:
   ```sh
   psql -h <host> -U <user> -d <db> -f backup-YYYY-MM-DDTHH-MM-SS.sql
   ```

## License
MIT
