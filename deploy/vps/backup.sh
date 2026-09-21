#!/usr/bin/env sh
set -eu

umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"

test -f deploy/vps/vps.env || { echo 'missing deploy/vps/vps.env' >&2; exit 1; }
. deploy/vps/vps.env
: "${MYSQL_DATABASE:?missing MYSQL_DATABASE}"
: "${MYSQL_USER:?missing MYSQL_USER}"
: "${MYSQL_PASSWORD:?missing MYSQL_PASSWORD}"
BACKUP_DIR=${BACKUP_DIR:-./backups}
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/${MYSQL_DATABASE}_$(date -u +%Y%m%dT%H%M%SZ).sql"

docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml exec -T mysql \
  sh -c 'exec mysqldump --single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$OUT"
chmod 600 "$OUT"
sha256sum "$OUT"
