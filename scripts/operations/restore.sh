#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then echo 'Uso: restore.sh archivo.dump nueva_base_aislada' >&2; exit 2; fi
case "$2" in restore_[a-zA-Z0-9_]*) ;; *) echo 'Usar una base con prefijo restore_ y nombre seguro.' >&2; exit 2;; esac
case "$2" in *[!a-zA-Z0-9_]*) exit 2;; esac
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$2"
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error --no-owner' sh "$2" < "$1"
echo 'Restauración aislada creada; no iniciar workers contra ella sin reconciliar ejecuciones.'
