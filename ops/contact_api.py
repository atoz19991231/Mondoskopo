#!/usr/bin/env python3
"""Local-only Mondoskopo contact API.

Only Caddy should forward HTTPS /api/contact requests to 127.0.0.1:8765.
Proton SMTP credentials live in a root-only systemd EnvironmentFile, never in
this source, the website HTML, JavaScript, or GitHub.
"""
from __future__ import annotations

from collections import defaultdict, deque
from email.message import EmailMessage
from email.utils import parseaddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import smtplib
import ssl
import threading
import time
from urllib.parse import urlsplit

HOST = "127.0.0.1"
PORT = 8765
MAX_BYTES = 24_576
ORIGINS = {"https://mondoskopo.org", "https://www.mondoskopo.org"}
EMAIL_RE = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")
TIME_WINDOW = 3600
MAX_PER_HOUR = 6
GLOBAL_MAX_PER_HOUR = 80
MIN_SECONDS_BETWEEN = 25
_recent: dict[str, deque[float]] = defaultdict(deque)
_global_recent: deque[float] = deque()
_lock = threading.Lock()


def valid_reply_address(raw: object) -> bool:
    if not isinstance(raw, str) or not 5 <= len(raw) <= 254:
        return False
    display, addr = parseaddr(raw)
    return not display and addr == raw and EMAIL_RE.fullmatch(raw) is not None


def validate(payload: object):
    if not isinstance(payload, dict):
        raise ValueError("Malformed message.")
    # Honeypot: bots sometimes complete hidden fields. Do not send them.
    if payload.get("website"):
        return None
    name = payload.get("name", "")
    reply = payload.get("email", "")
    message = payload.get("message", "")
    if not all(isinstance(x, str) for x in (name, reply, message)):
        raise ValueError("All fields must contain text.")
    name, reply, message = (name.strip(), reply.strip(), message.strip())
    if len(name) > 100 or "\r" in name or "\n" in name:
        raise ValueError("Name is too long.")
    if not valid_reply_address(reply):
        raise ValueError("Please enter a valid email address.")
    if not 10 <= len(message) <= 5000:
        raise ValueError("Message must contain 10–5000 characters.")
    return (name, reply, message)


def allow_send(ip: str, now: float | None = None) -> bool:
    now = time.monotonic() if now is None else now
    with _lock:
        history = _recent[ip]
        while history and now - history[0] > TIME_WINDOW:
            history.popleft()
        while _global_recent and now - _global_recent[0] > TIME_WINDOW:
            _global_recent.popleft()
        if len(_global_recent) >= GLOBAL_MAX_PER_HOUR:
            return False
        if len(history) >= MAX_PER_HOUR:
            return False
        if history and now - history[-1] < MIN_SECONDS_BETWEEN:
            return False
        # Reserve one slot before trying SMTP to limit abuse under concurrency.
        history.append(now)
        _global_recent.append(now)
        if len(_recent) > 2048:
            for key in list(_recent):
                if not _recent[key] or now - _recent[key][-1] > TIME_WINDOW:
                    del _recent[key]
        return True


def send_mail(name: str, reply: str, content: str) -> None:
    username = os.environ["MONDOSKOPO_SMTP_USER"]
    password = os.environ["MONDOSKOPO_SMTP_TOKEN"]
    destination = os.environ["MONDOSKOPO_CONTACT_TO"]
    if not valid_reply_address(username) or not valid_reply_address(destination):
        raise ValueError("Contact mail configuration is invalid.")
    email = EmailMessage()
    email["From"] = username
    email["To"] = destination
    email["Reply-To"] = reply
    email["Subject"] = "Mondoskopo website contact"
    email.set_content(
        "A visitor used the Mondoskopo contact form.\n\n"
        + "Name: " + (name or "(not provided)") + "\n"
        + "Reply address: " + reply + "\n\n"
        + "Message:\n" + content + "\n"
    )
    with smtplib.SMTP("smtp.protonmail.ch", 587, timeout=18) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(username, password)
        smtp.send_message(email)


class ContactHandler(BaseHTTPRequestHandler):
    server_version = "MondoskopoContact"
    sys_version = ""

    def log_message(self, *args):
        # No visitor IP, request body or reply addresses in the journal.
        return

    def reply(self, status: int, info: str) -> None:
        raw = json.dumps({"message": info}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def get_path(self):
        return urlsplit(self.path).path

    def do_GET(self):
        if self.get_path() != "/api/contact/health":
            self.reply(404, "Not found.")
            return
        # Configured service is reachable; this does not assert SMTP delivery.
        self.reply(200, "Contact service is ready.")

    def do_POST(self):
        if self.get_path() != "/api/contact":
            self.reply(404, "Not found.")
            return
        if self.headers.get("Origin") not in ORIGINS:
            self.reply(403, "Request origin not allowed.")
            return
        if self.headers.get_content_type() != "application/json":
            self.reply(415, "Unsupported message format.")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size < 2 or size > MAX_BYTES:
            self.reply(413, "Message is too large.")
            return
        try:
            raw = self.rfile.read(size)
            payload = json.loads(raw.decode("utf-8"))
            fields = validate(payload)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.reply(400, str(exc) if isinstance(exc, ValueError) else "Invalid message.")
            return
        if fields is None:
            # Silently accept honeypot to avoid rewarding spam bots.
            self.reply(200, "Message received.")
            return
        # This server is reachable only via local Caddy reverse proxy.
        # Even if X-Forwarded-For is absent, all messages share a safe rate cap.
        ip = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        if not ip or len(ip) > 60:
            ip = "unknown"
        if not allow_send(ip):
            self.reply(429, "Please wait before sending another message.")
            return
        try:
            send_mail(*fields)
        except (OSError, smtplib.SMTPException, KeyError, ValueError):
            # Do not leak mail credentials, mailbox addresses or SMTP detail.
            self.reply(503, "Message could not be delivered. Please try later.")
            return
        self.reply(200, "Your message has been sent.")

    def do_OPTIONS(self):
        self.reply(405, "Method not allowed.")


def main():
    required = ("MONDOSKOPO_SMTP_USER", "MONDOSKOPO_SMTP_TOKEN",
                "MONDOSKOPO_CONTACT_TO")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise SystemExit("Contact service requires server-side mail configuration.")
    # Never bind to a public network interface.
    ThreadingHTTPServer((HOST, PORT), ContactHandler).serve_forever()


if __name__ == "__main__":
    main()
