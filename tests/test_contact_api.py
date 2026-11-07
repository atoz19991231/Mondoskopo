"""Offline Mondoskopo contact relay tests. All delivery is mocked: no emails sent."""
from __future__ import annotations

from contextlib import contextmanager
import http.client
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "ops" / "contact_api.py"
spec = importlib.util.spec_from_file_location("mondoskopo_contact", SOURCE)
contact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contact)


@contextmanager
def local_server():
    server = contact.ThreadingHTTPServer((contact.HOST, 0), contact.ContactHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def request(port, method, path, body=None, origin="https://mondoskopo.org"):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    headers = {"Origin": origin, "Content-Type": "application/json",
               "X-Forwarded-For": "198.51.100.17"}
    content = json.dumps(body).encode() if body is not None else None
    connection.request(method, path, body=content, headers=headers)
    response = connection.getresponse()
    result = response.status, json.loads(response.read().decode())
    connection.close()
    return result


def valid():
    return {
        "name": "Test visitor",
        "email": "person@example.org",
        "message": "This is a legitimate question about the WGI indicators.",
        "website": ""
    }


class ContactValidationTests(unittest.TestCase):
    def setUp(self):
        with contact._lock:
            contact._recent.clear()

    def test_valid_form_fields(self):
        self.assertEqual(contact.validate(valid())[1], "person@example.org")

    def test_invalid_email_rejected(self):
        for email in ("bad-address", "A <person@example.org>",
                      "x@example.org\nBcc: victim@example.org"):
            payload = valid()
            payload["email"] = email
            with self.assertRaises(ValueError):
                contact.validate(payload)

    def test_message_too_short_or_long(self):
        for message in ("short", "x" * 5001):
            payload = valid()
            payload["message"] = message
            with self.assertRaises(ValueError):
                contact.validate(payload)

    def test_honeypot_no_delivery(self):
        payload = valid()
        payload["website"] = "https://spammer.example"
        self.assertIsNone(contact.validate(payload))

    def test_rate_limit(self):
        self.assertTrue(contact.allow_send("visitor", now=100))
        self.assertFalse(contact.allow_send("visitor", now=101))
        for now in (130, 160, 190, 220, 250):
            self.assertTrue(contact.allow_send("visitor", now=now))
        self.assertFalse(contact.allow_send("visitor", now=300))
        self.assertTrue(contact.allow_send("visitor", now=3801))

    def test_server_binds_loopback(self):
        self.assertEqual(contact.HOST, "127.0.0.1")

    def test_health_route(self):
        with local_server() as port:
            code, reply = request(port, "GET", "/api/contact/health")
        self.assertEqual(code, 200)
        self.assertIn("ready", reply["message"])

    def test_cannot_submit_cross_origin(self):
        with local_server() as port:
            with patch.object(contact, "send_mail") as sending:
                code, _ = request(port, "POST", "/api/contact",
                                  valid(), origin="https://attacker.invalid")
                sending.assert_not_called()
        self.assertEqual(code, 403)

    def test_success_requires_actual_mail_send(self):
        with local_server() as port:
            with patch.object(contact, "send_mail") as sending:
                code, reply = request(port, "POST", "/api/contact", valid())
                sending.assert_called_once_with(
                    "Test visitor", "person@example.org",
                    valid()["message"])
        self.assertEqual(code, 200)
        self.assertIn("sent", reply["message"])

    def test_smtp_failure_reports_failure_not_success(self):
        with local_server() as port:
            with patch.object(contact, "send_mail", side_effect=OSError("private SMTP failure")):
                code, reply = request(port, "POST", "/api/contact", valid())
        self.assertEqual(code, 503)
        self.assertNotIn("private SMTP failure", reply["message"])
        self.assertNotIn("sent", reply["message"])

    def test_rate_limited_request(self):
        with local_server() as port:
            with patch.object(contact, "send_mail") as sending:
                first, _ = request(port, "POST", "/api/contact", valid())
                second, _ = request(port, "POST", "/api/contact", valid())
        self.assertEqual((first, second), (200, 429))
        sending.assert_called_once()


if __name__ == "__main__":
    unittest.main()
