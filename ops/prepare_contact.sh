#!/usr/bin/env bash
# One-time safe preparation. DOES NOT enable mail or modify Caddy.
set -Eeuo pipefail
if [ "$EUID" -ne 0 ]; then
  echo "Run: sudo bash ops/prepare_contact.sh" >&2
  exit 1
fi
PROJECT="/home/desadmin/mondoskopo-deploy/site"
test -s "$PROJECT/ops/contact_api.py"
test -s "$PROJECT/ops/mondoskopo-contact.service"
test -s "$PROJECT/ops/contact.env.example"
install -d -m 700 /etc/mondoskopo
if [ ! -e /etc/mondoskopo/contact.env ]; then
  install -m 600 "$PROJECT/ops/contact.env.example" /etc/mondoskopo/contact.env
  echo "Created private /etc/mondoskopo/contact.env template."
else
  echo "Existing contact configuration preserved."
fi
install -m 644 "$PROJECT/ops/mondoskopo-contact.service" /etc/systemd/system/mondoskopo-contact.service
systemctl daemon-reload
echo "Contact service prepared but NOT started, NOT enabled, and Caddy NOT changed."
echo "Edit /etc/mondoskopo/contact.env with your private Proton SMTP token locally."
