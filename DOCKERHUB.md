# Docker Hub: postgres-backup

**This image is compatible only with PostgreSQL 16.**

Automated PostgreSQL backup utility for Docker. Backs up your database and uploads to S3-compatible storage (AWS S3, MinIO, etc). Supports cron scheduling and easy configuration via environment variables.

## Quick Start

```sh
docker run \
  --restart unless-stopped \
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydb \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e S3_ENDPOINT=https://s3.amazonaws.com \
  -e S3_BUCKET=my-bucket \
  -e S3_PREFIX=backups/ \
  -e BACKUP_SCHEDULE="0 0 * * *" \
  -e BACKUP_RETENTION_DAYS=30 \
  postgres-backup
```

## Environment Variables
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: PostgreSQL connection
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: S3 credentials
- `S3_ENDPOINT`: S3/MinIO endpoint
- `S3_BUCKET`: S3 bucket name
- `S3_PREFIX`: S3 key prefix (optional)
- `BACKUP_SCHEDULE`: Cron schedule (default: midnight UTC)

## How it works
- On startup, performs an immediate backup
- Schedules recurring backups via cron
- Uploads `.sql` dumps to S3

## Restoring
Download a backup from S3 and restore with:
```sh
psql -h <host> -U <user> -d <db> -f backup-YYYY-MM-DDTHH-MM-SS.sql
```

## Source & Issues
See [GitHub](https://github.com/Maxiviper117/docker-postgres-backup/)
See [GitHub - issues](https://github.com/Maxiviper117/docker-postgres-backup/issues)

## Versions

- `v1.2.0` - Added warning for non-PostgreSQL 16 and non-existent bucket.
- `v1.1.0` - Added backup retention policy.
- `v1.0.0` - Initial release with PostgreSQL 16 support.