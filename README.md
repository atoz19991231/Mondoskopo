# Mondoskopo

Observing humanity in motion. A public, advertising-free website for exploring institutions, democracy and change across countries and through time.

This repository belongs to the Mondoskopo website, and is intentionally separate from DES.

Current website: https://mondoskopo.org

## Deployment architecture

- Static web files only in `/var/www/mondoskopo` on the Netcup server.
- Caddy serves this directory over HTTPS.
- DES databases, source code, local services and credentials must never be copied into this directory or this public repository.
- Country-indicator values must be sourced and documented; never use invented values.

The initial website release is being added to this repository. Source provenance: World Bank WGI and optional V-Dem, with source year and version identified on the site when datasets are loaded.
