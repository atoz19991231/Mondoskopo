"""Offline safety checks: no network, root access or live server changes."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
DIMENSIONS = ("RL", "GE", "CC", "VA", "RQ", "PV")


def fixture(count=200, latest=2025):
    names = ["SWE", "POL"] + ["X%03d" % n for n in range(count - 2)]
    return {
        "source": {"name": "World Bank Worldwide Governance Indicators"},
        "indicators": {code: code for code in DIMENSIONS},
        "countries": {
            iso: {
                "name": iso,
                "indicators": {
                    code: [{"year": year, "value": 45.0}
                           for year in range(2015, latest + 1)]
                    for code in DIMENSIONS
                },
            }
            for iso in names
        },
    }


class FrontendDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="mondoskopo-deploy-test-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.site = self.root / "site"
        self.live = self.root / "live"
        self.backup = self.root / "backups"
        for sub in ("public/assets", "public/data"):
            (self.site / sub).mkdir(parents=True, exist_ok=True)
        (self.site / "public/index.html").write_text("NEW WEB UI")
        (self.site / "public/wgi.js").write_text("NEW WEB JS")
        (self.site / "public/vdem.js").write_text("NEW V-DEM UI")
        (self.site / "public/relations.js").write_text("NEW CONNECTIONS UI")
        (self.site / "public/assets/mondoskopo-globe.webp").write_bytes(b"globe")
        (self.site / "public/assets/favicon-32.png").write_bytes(b"icon")
        (self.site / "public/data/wgi.json").write_text('{"version":"OLD_CHECKOUT"}')
        source = (ROOT / "deploy.sh").read_text(encoding="utf-8")
        old_target = "TARGET=/var/www/mondoskopo"
        old_backups = "/var/backups/mondoskopo"
        self.assertIn(old_target, source)
        self.assertIn(old_backups, source)
        source = source.replace(old_target, "TARGET=" + str(self.live))
        source = source.replace(old_backups, str(self.backup))
        (self.site / "deploy.sh").write_text(source)
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        fake_sudo = fake_bin / "sudo"
        fake_sudo.write_text("#!/bin/sh\nexec \"$@\"\n")
        fake_sudo.chmod(0o755)
        self.env = dict(os.environ)
        self.env["PATH"] = str(fake_bin) + os.pathsep + self.env.get("PATH", "")

    def deploy(self, expected=0):
        proc = subprocess.run(
            ["bash", str(self.site / "deploy.sh")],
            capture_output=True, text=True, env=self.env, timeout=10)
        self.assertEqual(proc.returncode, expected, proc.stderr)
        return proc

    def test_first_deploy_bootstraps_data(self):
        self.deploy()
        self.assertEqual(
            (self.live / "data/wgi.json").read_text(),
            '{"version":"OLD_CHECKOUT"}')

    def test_new_frontend_does_not_overwrite_newer_live_data(self):
        (self.live / "data").mkdir(parents=True)
        live_path = self.live / "data/wgi.json"
        live_path.write_text('{"version":"NEWER_MONTHLY_IMPORT"}')
        self.deploy()
        self.assertEqual(live_path.read_text(), '{"version":"NEWER_MONTHLY_IMPORT"}')
        self.assertEqual((self.live / "index.html").read_text(), "NEW WEB UI")

    def test_failed_frontend_deploy_preserves_live_data(self):
        (self.live / "data").mkdir(parents=True)
        live_path = self.live / "data/wgi.json"
        live_path.write_text('{"version":"PUBLISHED"}')
        (self.site / "public/assets/favicon-32.png").unlink()
        result = subprocess.run(
            ["bash", str(self.site / "deploy.sh")],
            capture_output=True, text=True, env=self.env, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(live_path.read_text(), '{"version":"PUBLISHED"}')


class MonthlyValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = (ROOT / "ops/refresh-wgi.sh").read_text(encoding="utf-8")
        prefix = "<<'PY'\n"
        if prefix not in script or "\nPY\n" not in script:
            raise AssertionError("Could not locate live publication validator")
        cls.validator = script.split(prefix, 1)[1].split("\nPY\n", 1)[0]

    def validate(self, new, old):
        with tempfile.TemporaryDirectory(prefix="mondoskopo-validator-") as d:
            candidate = Path(d) / "candidate.json"
            live = Path(d) / "live.json"
            candidate.write_text(json.dumps(new), encoding="utf-8")
            live.write_text(json.dumps(old), encoding="utf-8")
            original = live.read_bytes()
            proc = subprocess.run(
                [sys.executable, "-", str(candidate), str(live)],
                input=self.validator, text=True, capture_output=True, timeout=15)
            self.assertEqual(live.read_bytes(), original,
                             "Validation must never modify published data")
            return proc

    def test_new_year_is_accepted(self):
        proc = self.validate(fixture(latest=2026), fixture(latest=2025))
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_previous_latest_year_cannot_be_lost(self):
        proc = self.validate(fixture(latest=2024), fixture(latest=2025))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("regressed latest year", proc.stderr)

    def test_country_coverage_regression_is_rejected(self):
        proc = self.validate(fixture(count=180), fixture(count=200))
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("coverage loss", proc.stderr)

    def test_missing_indicator_rejected(self):
        new = fixture()
        del new["indicators"]["PV"]
        proc = self.validate(new, fixture())
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Missing or unexpected WGI dimensions", proc.stderr)

    def test_invalid_value_rejected(self):
        new = fixture()
        new["countries"]["SWE"]["indicators"]["RL"][0]["value"] = 1000
        proc = self.validate(new, fixture())
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Invalid/duplicate observation", proc.stderr)


if __name__ == "__main__":
    unittest.main()
