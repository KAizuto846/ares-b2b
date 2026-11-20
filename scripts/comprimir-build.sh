#!/usr/bin/env bash
# Comprime el build de la SPA para que server.php sirva los .gz.
# Se ejecuta después de `vite build` (emptyOutDir borra el directorio).
set -euo pipefail

SPA="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend/public/spa" && pwd)"
[ -d "$SPA" ] || { echo "no existe $SPA"; exit 1; }

encontrados=0
while IFS= read -r -d '' f; do
  gzip -9 -f -k "$f"
  encontrados=$((encontrados + 1))
done < <(find "$SPA" -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' \
  -o -name '*.json' -o -name '*.webmanifest' -o -name '*.map' \) -print0)

echo "comprimidos: $encontrados archivos"

# Comparación rápida para el reporte
orig=$(du -sb "$SPA" | cut -f1)
gz=$(find "$SPA" -name '*.gz' -printf '%s\n' | awk '{s+=$1} END {print s+0}')
echo "tamaño total: $((orig / 1024)) kB — gzip de assets: $((gz / 1024)) kB"
