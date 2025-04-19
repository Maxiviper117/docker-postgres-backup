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
POSTGRES_HOST=your_postgres_host
POSTGRES_PORT=5432
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_db
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=https://s3.amazonaws.com # or your MinIO endpoint
S3_BUCKET=your-bucket
S3_PREFIX=backups/
BACKUP_SCHEDULE=0 0 * * * # every day at midnight UTC
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
