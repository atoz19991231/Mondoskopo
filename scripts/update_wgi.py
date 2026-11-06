#!/usr/bin/env python3
"""Import verified WGI governance scores from the World Bank API.

Publishes only after all six series for both countries pass validation.
No third-party Python dependencies. Never inserts sample observations.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public" / "data" / "wgi.json"
SOURCE = "https://api.worldbank.org/v2"
COUNTRIES = {"SWE": "Sweden", "POL": "Poland"}
INDICATORS = {
    "RL": "Rule of law",
    "GE": "Government effectiveness",
    "CC": "Control of corruption",
    "VA": "Voice and accountability",
    "RQ": "Regulatory quality",
    "PV": "Political stability",
}


def fetch_indicator(short_code: str) -> dict[str, list[dict]]:
    series_id = "GOV_WGI_" + short_code + ".SC"
    url = (
        f"{SOURCE}/country/SWE;POL/indicator/{series_id}"
        "?source=3&format=json&per_page=2000"
    )
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mondoskopo/0.4 (+https://mondoskopo.org)"},
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        payload = json.load(response)
    if not (isinstance(payload, list) and len(payload) == 2
            and isinstance(payload[0], dict) and isinstance(payload[1], list)):
        raise ValueError(f"Unexpected API response for {series_id}: {str(payload)[:160]}")
    metadata, observations = payload
    if int(metadata.get("pages", 1)) != 1:
        raise ValueError(f"API pagination truncated for {series_id}")
    result: dict[str, dict[int, float]] = {key: {} for key in COUNTRIES}
    for item in observations:
        iso = item.get("countryiso3code")
        if iso not in result:
            continue
        value = item.get("value")
        year = item.get("date")
        if value is None or isinstance(value, bool) or not isinstance(value, (float, int)):
            continue
        if not (isinstance(year, str) and year.isdigit() and len(year) == 4):
            continue
        numeric = float(value)
        # Governance scores, NOT percentile ranks, must lie between 0 and 100.
        if not (0 <= numeric <= 100):
            raise ValueError(f"Out-of-range value for {series_id}/{iso}/{year}: {numeric}")
        result[iso][int(year)] = round(numeric, 3)
    formatted = {
        iso: [{"year": y, "value": v} for y, v in sorted(year_map.items())]
        for iso, year_map in result.items()
    }
    for iso, values in formatted.items():
        if len(values) < 10:
            raise ValueError(
                f"Insufficient verified observations for {series_id}/{iso}: {len(values)}"
            )
    return formatted


def main() -> None:
    data = {
        "source": {
            "name": "World Bank Worldwide Governance Indicators",
            "release": "2026 update (methodology revised in 2025)",
            "url": "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
            "api": SOURCE,
            "license": "CC BY 4.0",
            "units": "Governance score (0–100), not a percentage or percentile",
            "retrieved_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        },
        "indicators": INDICATORS,
        "countries": {
            iso: {"name": name, "indicators": {}}
            for iso, name in COUNTRIES.items()
        },
    }
    for code in INDICATORS:
        print(f"Fetching {INDICATORS[code]}...", flush=True)
        series_by_country = fetch_indicator(code)
        for iso, series in series_by_country.items():
            data["countries"][iso]["indicators"][code] = series

    # The existing data is never touched unless every fetch and validation passed.
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".wgi-", dir=TARGET.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as outfile:
            json.dump(data, outfile, ensure_ascii=False, indent=2)
            outfile.write("\n")
        os.replace(temp_name, TARGET)
    finally:
        if os.path.exists(temp_name):
            os.remove(temp_name)
    latest = max(
        p["year"] for c in data["countries"].values()
        for series in c["indicators"].values() for p in series
    )
    print(f"OK: validated Sweden and Poland (six indicators), latest year {latest}")
    print(f"Saved: {TARGET}")


if __name__ == "__main__":
    main()
