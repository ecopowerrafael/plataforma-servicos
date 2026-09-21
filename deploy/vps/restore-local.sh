#!/usr/bin/env sh
set -eu

test "$#" -eq 1 || { echo 'usage: restore-local.sh /path/to/dump.sql' >&2; exit 2; }
case "$1" in
  /*) ;;
  *) echo 'restore requires an absolute dump path' >&2; exit 2 ;;
esac
test -s "$1" || { echo 'dump is missing or empty' >&2; exit 1; }

# Local-only restore target. Never point this command at production credentials.
docker compose --env-file deploy/vps/vps.env -f deploy/vps/docker-compose.yml exec -T mysql \
  sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$1"
