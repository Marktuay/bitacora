#!/usr/bin/env bash
set -euo pipefail
osrm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
osrm_image='ghcr.io/project-osrm/osrm-backend:26.4.1-debian@sha256:6b3d7232f168289fa97ca5a27c02a47895959a2f75cdc3ebfe406f31928702e5'
command -v docker >/dev/null || { echo 'Instalá Docker Engine en Ubuntu/WSL2 antes de continuar.'; exit 1; }
command -v curl >/dev/null || { echo 'Instalá curl antes de continuar.'; exit 1; }
docker info >/dev/null
docker compose version >/dev/null
mkdir -p "$osrm_dir/data"
if [[ ! -f "$osrm_dir/data/.prepared-26.4.1" ]]; then
  if [[ ! -f "$osrm_dir/data/nicaragua-latest.osm.pbf" ]]; then
    curl --fail --location --retry 3 --proto '=https' --proto-redir '=https' \
      'https://download.geofabrik.de/central-america/nicaragua-latest.osm.pbf' \
      --output "$osrm_dir/data/nicaragua-latest.osm.pbf.part"
    mv -- "$osrm_dir/data/nicaragua-latest.osm.pbf.part" "$osrm_dir/data/nicaragua-latest.osm.pbf"
  fi
  docker pull "$osrm_image"
  docker run --rm --volume "$osrm_dir/data:/data" "$osrm_image" osrm-extract -p /opt/car.lua /data/nicaragua-latest.osm.pbf
  docker run --rm --volume "$osrm_dir/data:/data" "$osrm_image" osrm-partition /data/nicaragua-latest.osrm
  docker run --rm --volume "$osrm_dir/data:/data" "$osrm_image" osrm-customize /data/nicaragua-latest.osrm
  touch "$osrm_dir/data/.prepared-26.4.1"
fi
docker compose --file "$osrm_dir/compose.yaml" up --detach
echo 'OSRM iniciado solo en esta PC, puerto 5000. Ejecutá activate.cjs desde Windows para comprobarlo y activar el enlace.'
