# Mondoskopo

Observing humanity in motion. A public, advertising-free website for exploring institutions, democracy and change across countries and through time.

This repository contains the Mondoskopo public website.

Current website: https://mondoskopo.org

## Deployment architecture

- Static web files only in `/var/www/mondoskopo` on the Netcup server.
- Caddy serves this directory over HTTPS.
- Keep all private files, databases, local services and credentials outside the public website directory and repository.
- Country-indicator values must be sourced and documented; never use invented values.

Data currently available: World Bank WGI. Additional sources, including V-Dem, may be added after their indicators and licensing are verified.


## Country coverage: World Bank WGI

The `scripts/update_wgi.py` program fetches the 2026 World Bank WGI governance *scores* (0–100), not older percentile ranks or the standardized -2.5 to +2.5 estimates. It retrieves all available countries and territories using the World Bank country catalogue, excluding regional aggregates. All six indicator series must have broad historical coverage; Sweden and Poland remain baseline checks. The importer validates the observed values before writing `public/data/wgi.json` atomically. The script never inserts made-up numbers.

Run offline validation tests, then retrieve and publish data from the isolated checkout on the Netcup server:

```bash
cd ~/mondoskopo-deploy/site
git pull --ff-only
python3 -m unittest discover -s tests -v
python3 scripts/update_wgi.py
bash deploy.sh
```

The first WGI fetch requires internet access and uses only the Python standard library. If the World Bank endpoint fails, the script fails and keeps the previously published data untouched. When data is present, Countries and Compare show interactive source-attributed time series for the available economies. Explore visualizes pairs of WGI dimensions within a single year, with one point per economy. This exploratory association is not a causal estimate.

Monthly updates are supported by the Netcup systemd timer described below. The timer must be installed and enabled separately.

WGI metrics are perception-based estimates of governance dimensions, **not** direct measures of democracy, societal resilience, or individual human capabilities. To avoid time-series discontinuities, use the WGI 2026 release, with historical scores revised consistently back to 1996.

Project source: https://www.worldbank.org/en/publication/worldwide-governance-indicators
License: CC BY 4.0, with attribution.

## Automatic WGI refresh on Netcup

Mondoskopo can refresh its World Bank WGI observations monthly, without requiring GitHub Actions or AI workloads. The public code is **not** updated by the timer; it updates only the validated `wgi.json` data file. The importer runs as the unprivileged site operator; only the final verified JSON is copied into the public data directory with elevated permissions.

Install the timer once (after reviewing the scripts):

```bash
cd ~/mondoskopo-deploy/site
git pull --ff-only
sudo bash scripts/install_monthly_refresh.sh
```

Inspect its schedule or status:

```bash
systemctl list-timers mondoskopo-wgi.timer --no-pager
sudo systemctl status mondoskopo-wgi.service --no-pager
```

If a fetch, validation or comparison fails, the existing publicly served data file remains intact, and the failure is logged in the system journal. Each successful refresh backs up the previously served JSON to `/var/backups/mondoskopo`. The timer runs monthly (on the first of each month, with up to 30 minutes random delay) and catches up after server downtime if necessary.

Important: The timer does *not* deploy changes to the HTML or JS application; frontend updates remain deliberate releases.

## Country period analysis

The Countries view lets visitors choose two actual observation years from the World Bank WGI dataset. It uses years shared across all six dimensions wherever at least two shared years are available; for incomplete series, it offers actual observed years and explicitly marks indicators whose endpoints are missing.

The default interval is approximately ten years ending with the most recent available observation. It picks an existing earlier observation rather than inventing a missing year. Each of the six country cards displays the score from the selected end year (or “not available”) and the change in **WGI score points** from the selected start year. The ranking sorts comparable indicators by **absolute** change on the same years; direction is labelled increase/decrease, not good/bad, and absent endpoint data are excluded. The history plot follows the selected interval. No composite governance index or statistical significance inference is generated.

The frontend uses a versioned script URL in `public/index.html` so that after deployment browsers do not silently use an older cached JS bundle.

## Two-country institutional changes

The Compare view offers two country selectors and a **shared** From year / To year. Years must be observed for both economies, preferably across all six WGI governance dimensions. If all six series do not overlap fully, only actual jointly observed years are offered, with unavailable indicator pairs explicitly flagged.

For each of the six indicators, the comparison shows both countries' selected end-year scores and their changes in WGI **score points** between the exact selected years. Cards are ordered by the absolute difference in these changes, calculated as first-country change minus second-country change. This is a difference in historical changes, **not** a ranking of countries, an estimate of causation, or a test of statistical significance. Selecting a card updates the shared historical chart to that dimension.

The selected-year interval is reused in the two-country chart. Source records are not interpolated. Empty endpoints do not become zeroes; only indicators with actual data for the same two years receive numerical change values.

## Global exploration on touchscreens

The Explore scatterplot displays two individual WGI governance scores for a single source year. Visitors can select the two axes and year, choose a country or territory from the accessible selector, or tap its plotted point. The selected country is highlighted and its exact pair of observed WGI scores is presented in a separate panel with a link to its country profile.

Only countries with observed values for both chosen indicators and the chosen year appear as dots. The panel explicitly reports unavailable pairs; no placeholder scores or interpolated data are displayed. Countries remain labeled in original World Bank geography terminology and associations are not interpreted as causation. Inputs and selected markers work without external map dependencies.

## Explore time slider

Explore has a touch-friendly year slider synchronized with the existing year dropdown. The slider visits **only recorded WGI observation years** (the earlier series includes gaps) rather than converting every integer year into a fabricated reading. Dragging the slider updates the global scatterplot, the source-year label, and the selected country's two indicator values.

The selected country has an amber trajectory through its actual paired X/Y observations up to the selected year. A dotted path connects consecutive *observed* positions, but does not estimate unobserved years. When the selected country lacks a pair in the selected year, the detail panel reports that fact rather than filling values. Visitors can select countries by tapping points, using the country dropdown, or following the country-profile link.

No automatic playback runs in the background. Animations and additional datasets can be considered after performance is checked on a real mobile device.
