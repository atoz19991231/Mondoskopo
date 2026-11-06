#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
TARGET=/var/www/mondoskopo
test -s "$BASE/public/index.html" || { echo "Missing public/index.html"; exit 1; }
sudo install -d -m 755 "$TARGET"
sudo install -d -m 700 /var/backups/mondoskopo
if [ -f "$TARGET/index.html" ]; then
  sudo cp -p "$TARGET/index.html" "/var/backups/mondoskopo/index-$(date +%Y%m%d-%H%M%S).html"
fi
sudo install -m 644 "$BASE/public/wgi.js" "$TARGET/wgi.js"
test -s "$BASE/public/assets/mondoskopo-globe.webp" || { echo "Missing Mondoskopo transparent globe" >&2; exit 1; }
test -s "$BASE/public/assets/favicon-32.png" || { echo "Missing Mondoskopo favicon" >&2; exit 1; }
sudo install -d -m 755 "$TARGET/assets"
sudo install -m 644 "$BASE/public/assets/mondoskopo-globe.webp" "$TARGET/assets/mondoskopo-globe.webp"
sudo install -m 644 "$BASE/public/assets/favicon-32.png" "$TARGET/assets/favicon-32.png"
if [ -s "$BASE/public/data/wgi.json" ]; then
  sudo install -d -m 755 "$TARGET/data"
  sudo install -m 644 "$BASE/public/data/wgi.json" "$TARGET/data/wgi.json"
fi
sudo install -m 644 "$BASE/public/index.html" "$TARGET/index.html"
echo "Mondoskopo public homepage deployed."
