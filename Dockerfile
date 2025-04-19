# ────────────────
# Stage 1: Build
# ────────────────
FROM node:23-slim AS builder

WORKDIR /usr/src/app

# Install deps deterministically
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --prod

# Copy app source
COPY . .

# ────────────────
# Stage 2: Runtime
# ────────────────
FROM node:23-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    gnupg \
    wget \
    lsb-release \
    && mkdir -p /etc/apt/keyrings \
    && wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor \
    > /etc/apt/keyrings/pgdg.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] \
    http://apt.postgresql.org/pub/repos/apt \
    $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    postgresql-client-16 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create 'backup' only if it doesn't already exist
RUN if ! id -u backup >/dev/null 2>&1; then \
    useradd \
    --system \
    --create-home \
    --home-dir /usr/src/app \
    --shell /usr/sbin/nologin \
    backup; \
    fi

WORKDIR /usr/src/app

# Copy built app and modules
COPY --from=builder /usr/src/app ./

# Set correct permissions
RUN chmod +x ./backup.js \
    && chown -R backup:backup /usr/src/app

USER backup

# (No ENV defaults: all must be passed at runtime)

ENTRYPOINT ["node", "backup.js"]