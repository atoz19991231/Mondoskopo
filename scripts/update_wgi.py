#!/usr/bin/env python3
"""Build a verified, versioned World Bank WGI dataset for Mondoskopo.

Six scores (0–100), 1996 onward, across the World Bank country catalogue.
No fake values and no third-party dependencies. Failed imports preserve old data.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public" / "data" / "wgi.json"
SOURCE = "https://api.worldbank.org/v2"
INDICATORS = {
    "RL": "Rule of law",
    "GE": "Government effectiveness",
    "CC": "Control of corruption",
    "VA": "Voice and accountability",
    "RQ": "Regulatory quality",
    "PV": "Political stability",
}


def api_records(path: str, params: dict[str, str]) -> list[dict]:
    """Collect *every* page; do not silently truncate an API result."""
    items: list[dict] = []
    pages = None
    page = 1
    while pages is None or page <= pages:
        query = urllib.parse.urlencode({**params, "format": "json",
                                        "per_page": "10000", "page": str(page)})
        url = SOURCE + path + "?" + query
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mondoskopo/0.5 (+https://mondoskopo.org)"},
        )
        with urllib.request.urlopen(request, timeout=65) as response:
            payload = json.load(response)
        if not (isinstance(payload, list) and len(payload) == 2
                and isinstance(payload[0], dict) and isinstance(payload[1], list)):
            raise ValueError("Unexpected World Bank API response at " + path)
        meta, records = payload
        count = int(meta.get("pages", 0))
        if count < 1 or count > 100:
            raise ValueError("Invalid page count at " + path)
        if pages is not None and count != pages:
            raise ValueError("World Bank pages changed while downloading " + path)
        pages = count
        if int(meta.get("page", 0)) != page:
            raise ValueError("World Bank API returned wrong page for " + path)
        items.extend(records)
        page += 1
    return items


def country_catalogue() -> dict[str, str]:
    result = {}
    for row in api_records("/country", {}):
        iso = row.get("id")
        region = row.get("region") or {}
        if (isinstance(iso, str) and len(iso) == 3
                and iso.isalpha() and region.get("id") != "NA"):
            name = row.get("name")
            if isinstance(name, str) and name.strip():
                result[iso] = name.strip()
    if len(result) < 190:
        raise ValueError("Country catalogue appears incomplete: " + str(len(result)))
    return result


def parse_scores(records: list[dict], valid_countries: set[str],
                 indicator: str) -> dict[str, list[dict]]:
    by_country: dict[str, dict[int, float]] = {}
    for row in records:
        iso = row.get("countryiso3code")
        if iso not in valid_countries:
            continue
        value, year = row.get("value"), row.get("date")
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Invalid score type for " + indicator + "/" + iso)
        if not (isinstance(year, str) and year.isdecimal() and len(year) == 4):
            raise ValueError("Invalid year for " + indicator + "/" + iso)
        yr = int(year)
        val = float(value)
        if not (1996 <= yr <= dt.datetime.now(dt.timezone.utc).year
                and math.isfinite(val) and 0 <= val <= 100):
            raise ValueError("Invalid year/score for " + indicator + "/" + iso)
        existing = by_country.setdefault(iso, {})
        if yr in existing and existing[yr] != val:
            raise ValueError("Conflicting duplicate observation: " + iso + "/" + year)
        existing[yr] = val
    return {
        iso: [{"year": year, "value": round(value, 3)}
              for year, value in sorted(scores.items())]
        for iso, scores in by_country.items()
        if len(scores) >= 10
    }


def main() -> None:
    names = country_catalogue()
    data = {
        "source": {
            "name": "World Bank Worldwide Governance Indicators",
            "release": "World Bank WGI API snapshot (retrieval timestamp below)",
            "url": "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
            "api": SOURCE,
            "license": "CC BY 4.0",
            "units": "Governance score (0–100), not a percentage or percentile",
            "retrieved_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        },
        "indicators": INDICATORS,
        "countries": {},
    }
    all_scores: dict[str, dict[str, list[dict]]] = {}
    for code, label in INDICATORS.items():
        print("Fetching " + label + "...", flush=True)
        records = api_records("/country/all/indicator/GOV_WGI_" + code + ".SC",
                              {"source": "3"})
        parsed = parse_scores(records, set(names), code)
        if len(parsed) < 175:
            raise ValueError(label + " has only " + str(len(parsed))
                             + " countries with >=10 observations")
        all_scores[code] = parsed
        print("  " + str(len(parsed)) + " countries", flush=True)

    for iso, name in sorted(names.items(), key=lambda item: item[1].casefold()):
        series = {code: all_scores[code][iso]
                  for code in INDICATORS if iso in all_scores[code]}
        if series:
            data["countries"][iso] = {"name": name, "indicators": series}

    for iso in ("SWE", "POL"):
        if not all(len(data["countries"].get(iso, {})
                       .get("indicators", {}).get(code, [])) >= 10
                   for code in INDICATORS):
            raise ValueError("Required baseline country missing: " + iso)

    latest = max(point["year"] for country in data["countries"].values()
                 for series in country["indicators"].values() for point in series)
    if latest < 2024:
        raise ValueError("WGI source appears outdated; latest year " + str(latest))

    # Write only when the entire global import has been checked.
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".wgi-", dir=TARGET.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as outfile:
            json.dump(data, outfile, ensure_ascii=False, separators=(",", ":"))
            outfile.write("\n")
        os.replace(temp_name, TARGET)
    finally:
        if os.path.exists(temp_name):
            os.remove(temp_name)
    print("OK: validated " + str(len(data["countries"]))
          + " countries, all six WGI dimensions, latest year " + str(latest))
    print("Saved: " + str(TARGET))


if __name__ == "__main__":
    main()
