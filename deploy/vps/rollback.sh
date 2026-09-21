#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"

test -n "${VPS_IMAGE_TAG:-}" || { echo 'set VPS_IMAGE_TAG to the previously validated image tag' >&2; exit 1; }
docker image inspect "$VPS_IMAGE_TAG" >/dev/null
docker tag "$VPS_IMAGE_TAG" plataforma-servicos-api:rollback
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml up -d api
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml ps
