#!/usr/bin/env bash
set -euo pipefail
umask 077
target="${1:-./supabase-selfhost}"
if [[ -e "$target" ]]; then echo 'La carpeta destino ya existe; no se reemplaza.' >&2; exit 1; fi
git clone --depth 1 --branch self-hosted/v0.8.1 https://github.com/supabase/supabase.git "$target/source"
cp -a "$target/source/docker" "$target/runtime"
cp "$target/runtime/.env.example" "$target/runtime/.env"
chmod 600 "$target/runtime/.env"
echo 'Plantilla oficial preparada. Configurar secretos, red y PostgreSQL 17 antes de arrancar.'
echo 'Ver docs/INFORMATICA.md. Este script no inicia servicios ni migra datos.'
