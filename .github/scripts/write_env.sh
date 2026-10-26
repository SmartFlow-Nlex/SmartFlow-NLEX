#!/usr/bin/env bash
# Writes the two settings files the trainers read, from the repository's encrypted secrets, at run time only.
# They exist on the runner for the length of the job and are never committed (both paths are gitignored).
#   smartflow_scripts/config/.env  DB_*   (config/db.py: every smartflow_scripts trainer)
#   Back-End/.env                  PG_*   (incident_model_scripts and the congestion trainer)
set -euo pipefail
: "${DB_HOST:?secret DB_HOST is not set}" "${DB_PASSWORD:?secret DB_PASSWORD is not set}"
umask 077
cat > smartflow_scripts/config/.env <<ENV
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-nlex_capstone}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD}
DB_SSLMODE=require
ENV
cat > Back-End/.env <<ENV
PG_HOST=${DB_HOST}
PG_PORT=${DB_PORT:-5432}
PG_DATABASE=${DB_NAME:-nlex_capstone}
PG_USER=${DB_USER:-postgres}
PG_PASSWORD=${DB_PASSWORD}
ENV
echo "settings written for ${DB_NAME:-nlex_capstone} on port ${DB_PORT:-5432}"
