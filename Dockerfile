# Use Node 20 on Debian slim as a base
FROM node:22-bullseye-slim

# Install ca-certificates and gnupg, then add PostgreSQL's Apt repo for v16+
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    gnupg \
    wget \
    lsb-release \
    && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
    && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | apt-key add - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package definition and lockfile first, then install
COPY package.json ./
RUN npm install --only=production

# Copy your backup script
COPY . .

# Ensure the script is executable
RUN chmod +x ./backup.js

# Run your script (which starts the cron job and does an immediate backup)
CMD ["node", "backup.js"]
