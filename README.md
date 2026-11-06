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


## First real dataset: World Bank WGI (Sweden and Poland)

The `scripts/update_wgi.py` program fetches the 2026 World Bank WGI governance *scores* (0–100), not older percentile ranks or the standardized -2.5 to +2.5 estimates. It requires all six indicator series for Sweden and Poland and validates the observed values before writing `public/data/wgi.json` atomically. The script never inserts made-up numbers.

Run on the Debian Netcup server from the isolated checkout:

```bash
cd ~/mondoskopo-deploy/site
git pull --ff-only
python3 scripts/update_wgi.py
bash deploy.sh
```

The first WGI fetch requires internet access and uses only the Python standard library. If the World Bank endpoint fails, the script fails and keeps the previously published data untouched. When data is present, Countries and Compare show interactive source-attributed timeseries. Explore is not yet implemented.

No automatic refresh job is active yet. In a later phase, schedule the import, validate the newly downloaded series, and deploy only verified updates.

WGI metrics are perception-based estimates of governance dimensions, **not** direct measures of democracy, societal resilience, or individual human capabilities. To avoid time-series discontinuities, use the WGI 2026 release, with historical scores revised consistently back to 1996.

Project source: https://www.worldbank.org/en/publication/worldwide-governance-indicators
License: CC BY 4.0, with attribution.
