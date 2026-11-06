#!/usr/bin/env bash
# One-time installation of a monthly systemd timer on the existing Netcup VPS.
set -Eeuo pipefail
if [ "$EUID" -ne 0 ]; then
    echo "Run with sudo: sudo bash scripts/install_monthly_refresh.sh" >&2
    exit 1
fi
PROJECT=/home/desadmin/mondoskopo-deploy/site
test -r "$PROJECT/ops/refresh-wgi.sh" || { echo "Mondoskopo checkout not found"; exit 1; }
test -r "$PROJECT/scripts/update_wgi.py" || { echo "WGI importer missing"; exit 1; }
id desadmin >/dev/null

install -d -m 755 /usr/local/libexec
install -m 755 "$PROJECT/ops/refresh-wgi.sh" /usr/local/libexec/mondoskopo-refresh-wgi
install -m 644 "$PROJECT/ops/mondoskopo-wgi.service" /etc/systemd/system/mondoskopo-wgi.service
install -m 644 "$PROJECT/ops/mondoskopo-wgi.timer" /etc/systemd/system/mondoskopo-wgi.timer

systemctl daemon-reload
systemctl enable --now mondoskopo-wgi.timer
systemctl list-timers mondoskopo-wgi.timer --no-pager
echo "Monthly WGI refresh scheduled. A catch-up refresh may run after enabling the timer."
