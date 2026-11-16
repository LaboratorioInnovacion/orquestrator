#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then echo 'Uso: backup.sh archivo.dump' >&2; exit 2; fi
umask 077
# Credentials remain in container environment; stdout contains the database backup.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$1"
echo 'Backup creado. Cifrar y copiar a almacenamiento externo según la política del propietario.'
