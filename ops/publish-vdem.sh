#!/usr/bin/env bash
# Publish the already validated V-Dem extract atomically without touching WGI.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGED="$ROOT/public/data/vdem.json"
LIVE="/var/www/mondoskopo/data/vdem.json"
BACKUPS="/var/backups/mondoskopo"
test -s "$STAGED" || { echo "No validated staged V-Dem extract found" >&2; exit 1; }

python3 - "$STAGED" "$LIVE" <<'PY'
import json
from pathlib import Path
import sys
new_path, live_path = [Path(x) for x in sys.argv[1:]]
with new_path.open(encoding="utf-8") as f:
    new = json.load(f)
source = new.get("source", {})
if source.get("version") != 16 or source.get("license") != "CC BY-SA 4.0":
    raise SystemExit("Refusing unverified V-Dem release/metadata")
if source.get("sha256") != "9055455c4adacd1ad9e78f1a7f3ac0768bdf26992e7651c0602a43ca7bdd4506":
    raise SystemExit("Refusing V-Dem extract not derived from pinned source ZIP")
codes = {"v2x_polyarchy", "v2x_libdem", "v2x_partipdem",
         "v2x_delibdem", "v2x_egaldem"}
if set(new.get("indicators", {})) != codes:
    raise SystemExit("Missing or unexpected V-Dem indicator")
countries = new.get("countries", {})
if len(countries) < 150 or any(iso not in countries for iso in ("SWE", "POL")):
    raise SystemExit("V-Dem extract lacks expected country coverage")
if live_path.exists():
    with live_path.open(encoding="utf-8") as f:
        old = json.load(f)
    if old.get("source", {}).get("version", 0) > 16:
        raise SystemExit("Refusing older V-Dem release")
    if len(countries) < 0.95 * len(old.get("countries", {})):
        raise SystemExit("Refusing major V-Dem country coverage regression")
print("Validated V-Dem extract for atomic publication:", len(countries), "country codes")
PY

sudo install -d -m 755 /var/www/mondoskopo/data
sudo install -d -m 700 "$BACKUPS"
if [ -f "$LIVE" ]; then
    sudo cp -p "$LIVE" "$BACKUPS/vdem-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
NEXT="/var/www/mondoskopo/data/.vdem-next-$$"
sudo install -m 644 "$STAGED" "$NEXT"
sudo mv -f "$NEXT" "$LIVE"
echo "V-Dem Core v16 published. WGI data left unchanged."
