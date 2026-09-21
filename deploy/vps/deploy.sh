#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"

test -f deploy/vps/vps.env || { echo 'missing deploy/vps/vps.env' >&2; exit 1; }

# Phase A only: image build must not migrate or bootstrap the database.
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml build api
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml up -d mysql
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml up -d api caddy
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml ps
