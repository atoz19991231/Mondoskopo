#!/usr/bin/env bash
# Installed as a root-owned system script; do not run from the checkout as root.
# Fetch as unprivileged desadmin; publish only a validated JSON data file.
set -Eeuo pipefail
umask 077

PROJECT=/home/desadmin/mondoskopo-deploy/site
STAGED="$PROJECT/public/data/wgi.json"
LIVE=/var/www/mondoskopo/data/wgi.json
BACKUPS=/var/backups/mondoskopo
LOCK=/run/lock/mondoskopo-wgi-refresh.lock

exec 9>"$LOCK"
if ! /usr/bin/flock -n 9; then
    echo "Another WGI refresh is already running"
    exit 0
fi

test -f "$PROJECT/scripts/update_wgi.py" || {
    echo "Importer not found: $PROJECT/scripts/update_wgi.py" >&2
    exit 1
}

# The importer atomically replaces STAGED only after all API responses pass
# validation. No website files are touched on failed network/import steps.
/usr/sbin/runuser -u desadmin -- /usr/bin/python3 "$PROJECT/scripts/update_wgi.py"

# Independently validate the staged JSON and guard against coverage regression.
/usr/bin/python3 - "$STAGED" "$LIVE" <<'PY'
import json
import math
import os
from pathlib import Path
import stat
import sys

new_path, old_path = map(Path, sys.argv[1:])
if not stat.S_ISREG(os.lstat(new_path).st_mode):
    raise SystemExit("Refusing non-regular staged data file")
def read(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
def describe(d):
    if d.get("source", {}).get("name") != "World Bank Worldwide Governance Indicators":
        raise ValueError("Unexpected data source")
    countries = d.get("countries", {})
    indicators = d.get("indicators", {})
    if len(countries) < 175:
        raise ValueError("Too few countries: " + str(len(countries)))
    if set(indicators) != {"RL", "GE", "CC", "VA", "RQ", "PV"}:
        raise ValueError("Missing or unexpected WGI dimensions")
    latest = 0
    for iso, country in countries.items():
        if not isinstance(country.get("name"), str):
            raise ValueError("Missing country name " + iso)
        for code, series in country.get("indicators", {}).items():
            if code not in indicators:
                raise ValueError("Unexpected indicator " + code)
            seen = set()
            for p in series:
                yr, val = p["year"], p["value"]
                if (not isinstance(yr, int) or isinstance(yr, bool)
                    or not isinstance(val, (int, float)) or isinstance(val, bool)
                    or not math.isfinite(val) or not 0 <= val <= 100
                    or yr in seen):
                    raise ValueError("Invalid/duplicate observation " + iso + "/" + code)
                seen.add(yr)
                latest = max(latest, yr)
    for iso in ("SWE", "POL"):
        if iso not in countries or any(
            len(countries[iso].get("indicators", {}).get(code, [])) < 10
            for code in indicators
        ):
            raise ValueError("Missing baseline series for " + iso)
    if latest < 2024:
        raise ValueError("Latest WGI year suspiciously old")
    return len(countries), latest

new_count, new_year = describe(read(new_path))
if old_path.exists():
    try:
        old_count, old_year = describe(read(old_path))
    except (ValueError, KeyError, TypeError):
        old_count, old_year = 0, 0  # Allow replacement of older two-country release.
    if new_year < old_year:
        raise SystemExit("Refusing WGI release with a regressed latest year")
    if old_count >= 175 and new_count < old_count * 0.95:
        raise SystemExit("Refusing WGI release with major country coverage loss")
print("Validated WGI publication: {} countries, latest year {}".format(new_count, new_year))
PY

/usr/bin/install -d -m 755 /var/www/mondoskopo/data
/usr/bin/install -d -m 700 "$BACKUPS"
if [ -f "$LIVE" ]; then
    /usr/bin/cp -p "$LIVE" "$BACKUPS/wgi-$(/usr/bin/date -u +%Y%m%dT%H%M%SZ).json"
fi

# Atomic replacement: browsers see old complete JSON or new complete JSON.
/usr/bin/install -m 644 "$STAGED" "/var/www/mondoskopo/data/.wgi-next-$$"
/usr/bin/mv -f "/var/www/mondoskopo/data/.wgi-next-$$" "$LIVE"
echo "Mondoskopo WGI data published."
