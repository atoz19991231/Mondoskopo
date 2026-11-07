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

Important: The timer does *not* deploy changes to the HTML or JS application; frontend updates remain deliberate releases. Conversely, `deploy.sh` installs a bundled WGI snapshot only if no live `wgi.json` exists. An ordinary frontend deployment must **never overwrite** WGI observations already published by the verified monthly refresh.

Offline protection tests: `python3 -m unittest discover -s tests -v`. The publication-safety tests run with temporary data and a fake `sudo` command; they do **not** access the live site or contact the World Bank. To verify that the timer actually runs on Netcup, inspect `systemctl list-timers mondoskopo-wgi.timer --no-pager` and `journalctl -u mondoskopo-wgi.service -n 30 --no-pager`. Neither GitHub nor offline tests alone establish the server's runtime state.

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

## V-Dem: five distinct dimensions of democracy

Mondoskopo's **Democracy** tab is a separate dataset, not a new WGI dimension and not a combined institutional/democracy score. It presents the five V-Dem headline indices on their original **0–1** scale: electoral, liberal, participatory, deliberative, and egalitarian democracy. The two-country view compares the same index within a single V-Dem release, and plots historical country-year series with two independent start-year and end-year sliders below the chart. Cards show observed end-year scores and changes calculated strictly between the two chosen years. Sliders offer only actual observation years shared by the selected pair (and cannot cross), and the historical lines are restricted to the chosen interval; missing endpoints are explicitly marked unavailable. Users are never shown invented country scores.

The importer uses the official [V-Dem Country-Year Core v16](https://v-dem.net/data/the-v-dem-dataset/country-year-v-dem-core-v16/) (March 2026):

Source ZIP: `https://www.v-dem.net/media/datasets/V-Dem-CY-Core-v16_csv.zip`.
Expected v16 SHA-256: `9055455c4adacd1ad9e78f1a7f3ac0768bdf26992e7651c0602a43ca7bdd4506`.

The ZIP is about 16 MB; the CSV inside is much larger. Python's built-in zipfile/csv modules **stream the CSV**, only storing the five requested indices and any accompanying model intervals for 1900 onward. It does not expand the archive into a 200+ MB local CSV and does not require R or extra Python libraries. The importer fails without replacing existing staged observations if the download, checksum, structure, score validation, or baseline coverage check fails. First publication of the extracted data is intentionally manual and independent from the active monthly WGI job.

To import on Netcup **after reviewing the version, license, and command**:

```bash
cd ~/mondoskopo-deploy/site && git pull --ff-only && python3 -m unittest discover -s tests -v && python3 scripts/import_vdem.py && bash ops/publish-vdem.sh && bash deploy.sh
```

Until the verified V-Dem extract is published to `/var/www/mondoskopo/data/vdem.json`, the Democracy tab shows a clear unavailable-data message, **not** example numbers. Neither the V-Dem importer nor its publisher writes `/var/www/mondoskopo/data/wgi.json`. The frontend deploy installs `vdem.js` but does not replace published V-Dem observations.

V-Dem datasets are licensed **CC BY-SA 4.0**, including commercial use with attribution and ShareAlike conditions. The derived extract and attribution retain this license; [Coppedge et al. (2026), V-Dem Country-Year Dataset v16](https://doi.org/10.23696/vdemds26) is the source citation. Review [V-Dem's FAQ](https://v-dem.net/about/faq/) and cautionary notes before interpreting small differences. V-Dem revises historical values across releases, so **never splice annual rows from v16 and a later release**. Moving to v17 will require explicit review, full-history replacement, versioned metadata and renewed validation; there is no blind V-Dem timer.

## Connections: joining democracy and governance without collapsing scales

The Connections view loads the two **independently published** datasets directly in the browser: `data/vdem.json` and `data/wgi.json`. It matches country units strictly by the same ISO3 / V-Dem `country_text_id` code and observation year, and plots only the paired values for the visitor's chosen two indicators. Unmatched countries and source years are excluded; V-Dem observations are never interpolated or converted to WGI scores. This intersection may exclude political units with different coding conventions. No false matches are introduced by country-name similarity.

The horizontal axis always shows a selected V-Dem democracy index on its 0–1 scale. The vertical axis shows a selected WGI governance score on its 0–100 scale. Dragging the year slider selects a **source-observed year** and updates all global country points. Selecting a country highlights it and draws a dotted path through its historical **paired** observations up to that year; gaps are not estimated. An inspect panel displays both exact numeric values and links to the existing country profile.

The global plot is descriptive. Neither an apparent relationship across countries nor a selected country's movement through time establishes causality. The datasets differ in their definitions, provenance, uncertainty treatment, release history and geographic coverage. Mondoskopo does not combine the axes into a synthetic overall index or treat these values as directly equivalent. The displayed source and licensing attribution must accompany the adapted V-Dem-derived data under CC BY-SA 4.0.

To publish a frontend change: `cd ~/mondoskopo-deploy/site && git pull --ff-only && python3 -m unittest discover -s tests -v && bash deploy.sh`. This deploy copies `relations.js` but **does not** overwrite either the live WGI or V-Dem data file.

## Contact form: private Proton mailbox, no public address

Contact is a static HTML form backed by a **separate local-only** Python SMTP relay (`ops/contact_api.py`). The form exposes neither the SMTP sender/recipient address nor the token to visitors. The browser only calls same-origin `/api/contact` via HTTPS. The contact button remains disabled until `/api/contact/health` responds; a successful message is shown only after the SMTP server accepts the email. The form has a honeypot, required reply address and message, size limits, a strict browser Origin check, per-client and global throttling, and no file-backed contact-message database. Failures never display SMTP configuration or server details.

Proton currently supports SMTP submission for paid Mail plans with active custom-domain addresses. Use **a dedicated SMTP token**, not your Proton login password. Host is `smtp.protonmail.ch`, port `587`, STARTTLS. SMTP sending is not end-to-end encrypted; Proton says messages are stored with zero-access encryption in the recipient mailbox. This is separate from receiving via Proton Bridge. See the [official Proton SMTP setup instructions](https://proton.me/support/smtp-submission).

**Preparation only** (does not start anything, expose credentials or change your Caddy configuration):

```bash
cd ~/mondoskopo-deploy/site && git pull --ff-only && python3 -m unittest discover -s tests -v && bash deploy.sh && sudo bash ops/prepare_contact.sh
```

Create the SMTP token under Proton Mail Settings → All settings → IMAP/SMTP → SMTP tokens. Enter the custom-domain sender address, token, and recipient email **locally** in `/etc/mondoskopo/contact.env`. That file is owned by root, mode 0600 and **must never be copied to GitHub or shared in chat**. Use `sudoedit /etc/mondoskopo/contact.env` or another private terminal editor. The `ops/contact.env.example` file is only a placeholder template.

Before enabling the service, inspect `/etc/caddy/Caddyfile`. Add the exact-match Caddy route from `ops/contact.caddy.snippet` **inside the existing `mondoskopo.org` site block**. Do not blindly replace the current Caddyfile or disrupt existing static files. Validate configuration with `sudo caddy validate --config /etc/caddy/Caddyfile` before `sudo systemctl reload caddy`. The application listens **only on 127.0.0.1:8765**, not a public port.

Once the private environment and verified Caddy route exist, start the backend:

```bash
sudo systemctl enable --now mondoskopo-contact.service
sudo systemctl status mondoskopo-contact.service --no-pager
```

Confirm the health check at `https://mondoskopo.org/api/contact/health`, then submit a test message from the form and verify it arrives in the configured Proton inbox. Until the backend route is active, the website shows the contact form with its submit button disabled and a clear unavailable message. Contact content is only sent as mail, not retained in server-side files, but email messages live in the recipient mailbox and must be managed there. Avoid sending sensitive personal information.

Use `sudo journalctl -u mondoskopo-contact.service -n 30 --no-pager` to check startup, but the service does not log visitor addresses or contact message bodies. The existing WGI monthly timer and V-Dem publisher are unaffected by this service.
