#!/usr/bin/env python3
"""Import pinned V-Dem Core v16. Stream CSV inside ZIP; retain source attribution."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public" / "data" / "vdem.json"
SOURCE_URL = "https://www.v-dem.net/media/datasets/V-Dem-CY-Core-v16_csv.zip"
EXPECTED_SHA256 = "9055455c4adacd1ad9e78f1a7f3ac0768bdf26992e7651c0602a43ca7bdd4506"
ZIP_LIMIT = 32 * 1024 * 1024
CSV_LIMIT = 350 * 1024 * 1024
METRICS = {
    "v2x_polyarchy": "Electoral democracy",
    "v2x_libdem": "Liberal democracy",
    "v2x_partipdem": "Participatory democracy",
    "v2x_delibdem": "Deliberative democracy",
    "v2x_egaldem": "Egalitarian democracy",
}
CODE_RE = re.compile(r"^[A-Z0-9]{2,6}$")


def verify_archive(path: Path) -> str:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            size += len(block)
            if size > ZIP_LIMIT:
                raise ValueError("V-Dem ZIP exceeds expected maximum size")
            digest.update(block)
    actual = digest.hexdigest()
    if actual != EXPECTED_SHA256:
        raise ValueError("Unexpected V-Dem ZIP SHA256; not publishing: " + actual)
    return actual


def fetch_archive(path: Path) -> None:
    request = Request(SOURCE_URL, headers={
        "User-Agent": "Mondoskopo/0.7 (https://mondoskopo.org)"
    })
    with urlopen(request, timeout=120) as response, path.open("wb") as output:
        size = 0
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            if size > ZIP_LIMIT:
                raise ValueError("Official archive is unexpectedly large")
            output.write(block)
    if size < 100000:
        raise ValueError("Official archive is unexpectedly small")


def parse_number(raw: str, label: str, code: str, year: int):
    if raw is None or not raw.strip() or raw.strip().upper() in {"NA", "NAN"}:
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid {label} for {code}/{year}: {raw!r}") from exc
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"Out-of-range {label} for {code}/{year}: {raw!r}")
    return value


def parse_archive(path: Path, digest: str, *, min_countries: int = 150) -> dict:
    names: dict[str, str] = {}
    values: dict[str, dict[str, dict[int, dict]]] = {}
    with ZipFile(path) as archive:
        items = [item for item in archive.infolist()
                 if Path(item.filename).name == "V-Dem-CY-Core-v16.csv"]
        if len(items) != 1 or items[0].file_size > CSV_LIMIT:
            raise ValueError("Missing or unexpected-size V-Dem v16 Core CSV")
        with archive.open(items[0]) as packed:
            with io.TextIOWrapper(packed, encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                fields = set(reader.fieldnames or [])
                required = {"country_text_id", "country_name", "year", *METRICS}
                if not required.issubset(fields):
                    raise ValueError("Missing required columns: " +
                                     ", ".join(sorted(required - fields)))
                for row in reader:
                    code = (row["country_text_id"] or "").strip()
                    name = (row["country_name"] or "").strip()
                    year_text = (row["year"] or "").strip()
                    if not CODE_RE.fullmatch(code) or not name:
                        continue
                    if not year_text.isdecimal():
                        raise ValueError("Invalid source year: " + code)
                    year = int(year_text)
                    if not 1789 <= year <= 2025:
                        raise ValueError("Unexpected year in V-Dem v16: " + str(year))
                    if year < 1900:
                        continue
                    names.setdefault(code, name)
                    for metric in METRICS:
                        score = parse_number(row[metric], metric, code, year)
                        if score is None:
                            continue
                        point = {"year": year, "value": score}
                        lo, hi = metric + "_codelow", metric + "_codehigh"
                        if lo in fields and hi in fields:
                            lower = parse_number(row[lo], lo, code, year)
                            upper = parse_number(row[hi], hi, code, year)
                            if lower is not None and upper is not None:
                                if not lower <= score <= upper:
                                    raise ValueError("Invalid interval for " +
                                                     metric + "/" + code + "/" + str(year))
                                point.update(lower=lower, upper=upper)
                        series = values.setdefault(code, {}).setdefault(metric, {})
                        if year in series and series[year] != point:
                            raise ValueError("Conflicting V-Dem duplicate: " +
                                             code + "/" + metric + "/" + str(year))
                        series[year] = point
    countries = {}
    for code, group in values.items():
        sorted_group = {
            metric: [series[year] for year in sorted(series)]
            for metric, series in group.items() if len(series) >= 10
        }
        if sorted_group:
            countries[code] = {"name": names[code], "indicators": sorted_group}
    if len(countries) < min_countries:
        raise ValueError("Too few V-Dem political units: " + str(len(countries)))
    for code in ("SWE", "POL"):
        if code not in countries or any(
            len(countries[code]["indicators"].get(metric, [])) < 20 for metric in METRICS
        ):
            raise ValueError("Missing baseline history for " + code)
    latest = max(p["year"] for country in countries.values()
                 for series in country["indicators"].values() for p in series)
    if latest < 2024:
        raise ValueError("V-Dem dataset appears outdated: " + str(latest))
    return {
        "source": {
            "name": "Varieties of Democracy (V-Dem) Project",
            "dataset": "Country-Year: V-Dem Core",
            "version": 16,
            "published": "March 2026",
            "citation": "Coppedge et al. (2026), V-Dem Country-Year Dataset v16",
            "doi": "https://doi.org/10.23696/vdemds26",
            "url": SOURCE_URL,
            "sha256": digest,
            "license": "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "adaptation": "Five headline indices and available uncertainty intervals, 1900 onward. No estimated missing years.",
            "retrieved_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "indicators": METRICS,
        "countries": dict(sorted(countries.items())),
    }


def save_atomic(data: dict, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".vdem-staged-", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            json.dump(data, out, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            out.write("\n")
        os.replace(temp_name, target)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import pinned official V-Dem Core v16")
    parser.add_argument("--archive", type=Path, help="Use an existing official ZIP")
    args = parser.parse_args()
    if args.archive:
        digest = verify_archive(args.archive)
        data = parse_archive(args.archive, digest)
    else:
        with tempfile.TemporaryDirectory(prefix="mondoskopo-vdem-") as folder:
            archive = Path(folder) / "V-Dem-CY-Core-v16_csv.zip"
            print("Fetching official V-Dem v16 Core archive...", flush=True)
            fetch_archive(archive)
            digest = verify_archive(archive)
            data = parse_archive(archive, digest)
    save_atomic(data, TARGET)
    latest = max(p["year"] for c in data["countries"].values()
                 for series in c["indicators"].values() for p in series)
    print(f"Validated V-Dem v16: {len(data['countries'])} country codes; latest {latest}.")
    print(f"Staged: {TARGET}. Live site not changed yet.")


if __name__ == "__main__":
    main()
