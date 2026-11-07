"""Offline validation of V-Dem CSV import; never accesses the network or live site."""
import csv
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from zipfile import ZIP_DEFLATED, ZipFile

module = Path(__file__).resolve().parents[1] / "scripts" / "import_vdem.py"
spec = importlib.util.spec_from_file_location("mondoskopo_vdem", module)
vdem = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vdem)


def sample_archive(path: Path, *, bad_score=False, missing_metric=False):
    fields = ["country_text_id", "country_name", "year"]
    for metric in vdem.METRICS:
        fields.extend([metric, metric + "_codelow", metric + "_codehigh"])
    if missing_metric:
        fields.remove("v2x_egaldem")
    rows = []
    for code in ("SWE", "POL", "USA", "FRA"):
        for year in range(2000, 2025):
            row = {"country_text_id": code, "country_name": code, "year": str(year)}
            for metric in vdem.METRICS:
                row[metric] = str(.4 + (year - 2000) * .002)
                row[metric + "_codelow"] = str(.3 + (year - 2000) * .002)
                row[metric + "_codehigh"] = str(.5 + (year - 2000) * .002)
            rows.append(row)
    if bad_score:
        rows[0]["v2x_polyarchy"] = "9.0"
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("V-Dem-CY-Core-v16.csv", buffer.getvalue())


class VdemImportTests(unittest.TestCase):
    def test_valid_streamed_extract_and_source(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.zip"
            sample_archive(path)
            data = vdem.parse_archive(path, "test", min_countries=2)
            self.assertEqual(len(data["countries"]), 4)
            series = data["countries"]["SWE"]["indicators"]["v2x_libdem"]
            self.assertEqual(series[0]["lower"], .3)
            self.assertEqual(series[-1]["year"], 2024)
            self.assertEqual(data["source"]["license"], "CC BY-SA 4.0")

    def test_bad_score_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.zip"
            sample_archive(path, bad_score=True)
            with self.assertRaisesRegex(ValueError, "Out-of-range"):
                vdem.parse_archive(path, "test", min_countries=2)

    def test_required_column_is_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.zip"
            sample_archive(path, missing_metric=True)
            with self.assertRaisesRegex(ValueError, "Missing required columns"):
                vdem.parse_archive(path, "test", min_countries=2)

    def test_wrong_archive_hash_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.zip"
            sample_archive(path)
            with self.assertRaisesRegex(ValueError, "Unexpected V-Dem ZIP SHA256"):
                vdem.verify_archive(path)

    def test_failed_import_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.zip"
            destination = Path(folder) / "vdem.json"
            sample_archive(path, bad_score=True)
            destination.write_text("original")
            with self.assertRaises(ValueError):
                staged = vdem.parse_archive(path, "test", min_countries=2)
                vdem.save_atomic(staged, destination)
            self.assertEqual(destination.read_text(), "original")

    def test_atomic_write(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "vdem.json"
            vdem.save_atomic({"verified": True}, destination)
            self.assertEqual(destination.read_text().strip(), '{"verified":true}')


if __name__ == "__main__":
    unittest.main()
