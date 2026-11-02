#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${SOURCE_DB_URL:?Definir conexión PostgreSQL de origen en el entorno privado}"
target="${1:-./respaldo-bitacora}"
mkdir -p "$target"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$target/roles.sql" --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f "$target/schema.sql"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$target/data.sql" --use-copy --data-only
echo 'Respaldo SQL terminado. Los archivos privados de Storage se exportan por separado.'
