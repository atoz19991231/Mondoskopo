"""Offline tests for the Caddyfile contact-route installer. No Caddy reloads."""
import importlib.util
from pathlib import Path
import unittest

SRC = Path(__file__).resolve().parents[1] / "ops" / "install_contact_route.py"
spec = importlib.util.spec_from_file_location("mondoskopo_caddy_route", SRC)
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)

BASE = """mondoskopo.org {
    bind 159.195.130.80
    root * /var/www/mondoskopo
    file_server
}
"""


class ContactRouteTests(unittest.TestCase):
    def test_inserts_only_exact_contact_routes(self):
        result, changed = route.add_route(BASE)
        self.assertTrue(changed)
        self.assertIn("@mondoskopo_contact path /api/contact /api/contact/health", result)
        self.assertIn("reverse_proxy @mondoskopo_contact 127.0.0.1:8765", result)
        self.assertIn("bind 159.195.130.80", result)
        self.assertIn("root * /var/www/mondoskopo", result)
        self.assertIn("file_server", result)

    def test_repeat_is_safe(self):
        first, _ = route.add_route(BASE)
        second, changed = route.add_route(first)
        self.assertFalse(changed)
        self.assertEqual(first, second)

    def test_preserves_other_sites(self):
        suffix = "\nexample.org {\n    respond \"hello\"\n}\n"
        final, changed = route.add_route(BASE + suffix)
        self.assertTrue(changed)
        self.assertTrue(final.endswith(suffix))

    def test_refuses_wrong_site_root(self):
        with self.assertRaises(ValueError):
            route.add_route(BASE.replace("/var/www/mondoskopo", "/var/www/elsewhere"))

    def test_refuses_ambiguous_duplicate_sites(self):
        with self.assertRaises(ValueError):
            route.add_route(BASE + "\n" + BASE)

    def test_refuses_conflicting_route(self):
        modified = BASE.replace(
            "    file_server",
            "    @mondoskopo_contact path /other\n"
            "    reverse_proxy @mondoskopo_contact 127.0.0.1:9999\n"
            "    file_server",
        )
        with self.assertRaises(ValueError):
            route.add_route(modified)

    def test_refuses_nested_layout_not_in_inspected_screenshot(self):
        with self.assertRaises(ValueError):
            route.add_route(
                "mondoskopo.org {\n"
                "    root * /var/www/mondoskopo\n"
                "    handle /other {\n        respond ok\n    }\n"
                "    file_server\n}\n"
            )


if __name__ == "__main__":
    unittest.main()
