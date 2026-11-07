#!/usr/bin/env python3
"""Safely add only the Mondoskopo contact API route to the existing Caddyfile.

The public static site and the WGI/V-Dem data files are not changed.
This script must be run as root on the Mondoskopo Netcup host.
"""
from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

CADDYFILE = Path("/etc/caddy/Caddyfile")
ROUTE = (
    "    @mondoskopo_contact path /api/contact /api/contact/health\n"
    "    reverse_proxy @mondoskopo_contact 127.0.0.1:8765\n"
)
SITE_RE = re.compile(
    r"^mondoskopo\.org[ \t]*\{[ \t]*\r?\n"
    r"(?P<body>[^{}]*?)"
    r"^\}[ \t]*$",
    re.MULTILINE,
)


def add_route(config: str) -> tuple[str, bool]:
    matches = list(SITE_RE.finditer(config))
    if len(matches) != 1:
        raise ValueError("Expected one simple mondoskopo.org site block; refusing to edit.")
    match = matches[0]
    body = match.group("body")
    if not re.search(r"(?m)^[ \t]*root[ \t]+\*[ \t]+/var/www/mondoskopo[ \t]*$", body):
        raise ValueError("Unexpected site root; refusing to edit.")
    if not re.search(r"(?m)^[ \t]*file_server[ \t]*$", body):
        raise ValueError("Expected static file_server in the site block.")
    if "@mondoskopo_contact" in config:
        if (re.search(r"(?m)^[ \t]*@mondoskopo_contact[ \t]+path[ \t]+/api/contact[ \t]+/api/contact/health[ \t]*$", body)
            and re.search(r"(?m)^[ \t]*reverse_proxy[ \t]+@mondoskopo_contact[ \t]+127\.0\.0\.1:8765[ \t]*$", body)):
            return config, False
        raise ValueError("Existing contact route differs; refusing to overwrite.")
    updated = config[:match.end("body")] + ROUTE + config[match.end("body"):]
    return updated, True


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo; Caddyfile is root-managed.")
    if not CADDYFILE.is_file():
        raise SystemExit("Missing /etc/caddy/Caddyfile.")
    run(["systemctl", "is-active", "--quiet", "mondoskopo-contact.service"])
    original = CADDYFILE.read_text(encoding="utf-8")
    try:
        updated, changed = add_route(original)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if not changed:
        print("Contact route already present. Existing Caddy configuration preserved.")
        return
    mode = stat.S_IMODE(CADDYFILE.stat().st_mode)
    fd, temp_name = tempfile.mkstemp(prefix=".mondoskopo-caddy-candidate-", dir=CADDYFILE.parent)
    candidate = Path(temp_name)
    backup = CADDYFILE.with_name(
        "Caddyfile.backup-contact-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(updated)
            output.flush()
            os.fsync(output.fileno())
        metadata = CADDYFILE.stat()
        os.chown(candidate, metadata.st_uid, metadata.st_gid)
        os.chmod(candidate, mode)
        # Explicit adapter because the temporary file is not named Caddyfile.
        run(["caddy", "validate", "--adapter", "caddyfile", "--config", str(candidate)])
        shutil.copy2(CADDYFILE, backup)
        os.replace(candidate, CADDYFILE)
        try:
            run(["systemctl", "reload", "caddy"])
        except subprocess.CalledProcessError:
            os.replace(backup, CADDYFILE)
            print("Caddy reload failed; original Caddyfile restored.", file=sys.stderr)
            raise
        print("Caddy validated and reloaded. Contact API routed to localhost.")
        print("Original Caddyfile backed up at:", backup)
    finally:
        if candidate.exists():
            candidate.unlink()


if __name__ == "__main__":
    main()
