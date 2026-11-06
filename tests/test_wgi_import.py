"""Offline WGI importer validation tests. No network requests."""
import importlib.util
from pathlib import Path
import unittest


module_path = Path(__file__).resolve().parents[1] / "scripts" / "update_wgi.py"
spec = importlib.util.spec_from_file_location("mondoskopo_wgi", module_path)
wgi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wgi)


def records(iso="SWE", count=12):
    return [
        {"countryiso3code": iso, "date": str(2000 + i),
         "value": 50.0 + i / 10}
        for i in range(count)
    ]


class WgiValidationTests(unittest.TestCase):
    def test_valid_country_history_is_sorted(self):
        result = wgi.parse_scores(list(reversed(records())), {"SWE"}, "RL")
        self.assertEqual(len(result["SWE"]), 12)
        self.assertEqual(result["SWE"][0]["year"], 2000)
        self.assertEqual(result["SWE"][-1]["year"], 2011)

    def test_drops_aggregate_and_unknown_countries(self):
        result = wgi.parse_scores(records("AFE") + records(), {"SWE"}, "RL")
        self.assertEqual(set(result), {"SWE"})

    def test_excludes_short_history(self):
        result = wgi.parse_scores(records(count=9), {"SWE"}, "RL")
        self.assertEqual(result, {})

    def test_rejects_out_of_range_governance_scores(self):
        bad = records()
        bad[3]["value"] = 110
        with self.assertRaises(ValueError):
            wgi.parse_scores(bad, {"SWE"}, "RL")

    def test_rejects_conflicting_duplicates(self):
        bad = records()
        bad.append({"countryiso3code": "SWE", "date": "2002", "value": 34})
        with self.assertRaises(ValueError):
            wgi.parse_scores(bad, {"SWE"}, "RL")

    def test_missing_is_not_zero(self):
        bad = records()
        bad[2]["value"] = None
        result = wgi.parse_scores(bad, {"SWE"}, "RL")
        self.assertEqual(len(result["SWE"]), 11)
        self.assertNotIn(2002, [p["year"] for p in result["SWE"]])


if __name__ == "__main__":
    unittest.main()
