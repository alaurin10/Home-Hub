# Home-Hub Dashboard

Custom air-quality dashboard for the Home-Hub fleet: **FastAPI** backend
(Home Assistant proxy + built-in simulator) serving a **React + TypeScript**
frontend (Vite, Tailwind CSS 4, Framer Motion, Recharts, dnd-kit).

- **Live data** from HA's WebSocket API; short history from the REST history
  API; **long history (7/30/90 days)** from HA long-term statistics — no
  InfluxDB dependency.
- **Demo mode** (default when no `HA_TOKEN` is set): a deterministic simulator
  generates realistic diurnal CO2 curves, kitchen cooking PM/VOC spikes, and
  comfort metrics using the exact Magnus formulas from `packages/comfort.yaml`.
  The app runs standalone before any hardware exists.
- **Air score**: each room gets a 0–100 number — 100 minus "distance past its
  comfortable band x a weight" per reading — and the house gets one weighted
  toward its worst room. Derived server-side (`score.py`) so every client agrees
  and a future automation can reuse it; the Settings dialog shows the worked
  arithmetic straight from the API, so the explanation cannot drift from the
  number.
- **Outdoor context without an outdoor node**: enter a location in Settings and
  the backend reads the nearest **NWS observation station** for
  temperature/humidity/wind and **Open-Meteo** for AQI and PM2.5, computing
  sunrise/sunset locally. No API key, no account. Unset or unreachable, the card
  is simply absent — nothing is fabricated.
- **"What happened today"**: plain rules over the last 24 h (`insights.py`)
  infer cooking, overnight occupancy, a window opening, solar gain, and whether
  it is worth ventilating right now. Causal claims are hedged and badged
  **Likely**, counted ones **Measured**, and every row carries the evidence that
  triggered it. A rule that does not fire produces nothing.
- **Editable comfort bands**: the Settings dialog tunes the temperature and
  humidity comfort windows live (fair/poor widen automatically); overrides
  persist server-side (`data/thresholds.json`) and layer over the `config.yaml`
  defaults, so un-tuned metrics keep tracking config. Every status dot, room
  score and house score re-reads from them.
- **Responsive**: one build, breaking at 1024 px — a persistent rail, hero and
  three-up room grid above it; a single column with a floating tab bar below.
- **No app-level auth by design**: the HA token lives server-side only, and
  remote access rides the LAN → Tailscale / Cloudflare Access posture from
  `docs/00-architecture.md` §10. Never port-forward this app.

## Quickstart (demo mode)

```sh
# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DEMO_MODE=1 .venv/bin/uvicorn app.main:app --port 8000

# frontend (second terminal; dev server proxies /api → :8000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. `SIM_FAULT=bedroom` makes a node stale to see the
fleet-problem UI. `SIM_SEED` changes the generated world.

## Against real Home Assistant (Phase 2+)

```sh
cp .env.example .env    # set HA_BASE_URL + HA_TOKEN (long-lived token)
docker compose up -d --build
```

Serves everything on port 8080 (frontend + API same-origin). The HA provider
is deliberately thin and interface-identical to the tested simulator; exercise
it when the first node is live (it cannot be tested before HA exists).

## Auto-deploy on push (optional)

`scripts/deploy.sh` polls `origin/main` and, only when `apps/dashboard/**`
actually changed, fast-forwards the checkout and runs `docker compose up -d
--build`. Outbound-only (it just fetches from GitHub) — no inbound ports, no
webhook receiver, matching the no-inbound-ports posture in
`docs/00-architecture.md` §10.

Install as a systemd timer on the Docker host (runs every 5 minutes):

```sh
sudo cp systemd/dashboard-deploy.service systemd/dashboard-deploy.timer /etc/systemd/system/
sudo sed -i 's|/opt/home-hub|<real clone path>|' /etc/systemd/system/dashboard-deploy.service
sudo systemctl daemon-reload
sudo systemctl enable --now dashboard-deploy.timer
```

Check it: `systemctl status dashboard-deploy.timer`, `journalctl -u dashboard-deploy.service -f`.
The host's checkout must stay on `main` with a clean working tree — it's a
deploy target, not a dev checkout — the script uses `git merge --ff-only` and
fails loudly (systemd unit fails, visible in `journalctl`) rather than force
anything.

## Configuration

`config.yaml` is the customization surface: rooms, their HA entities, and the
air-quality thresholds that drive every signal color. Add a room there and the
UI grows a card — the frontend renders entirely from `/api/config`.

`config.yaml` also carries an optional `score:` block (targets, weights, band
cut-offs, the house weighting) — delete it and the defaults in `score.py` apply.

Temperature and humidity comfort bands are tunable at runtime from the dashboard
(**Settings → Comfort**). Those overrides are saved to `data/thresholds.json` and
merged over the `config.yaml` defaults on every start; delete that file to fall
back to config.

**Settings → Weather** takes a location — a town and state, or raw
`latitude, longitude` — saved to `data/settings.json` along with the temperature
scale. It is resolved through Open-Meteo geocoding and the matched station is
shown back, so a location that matched nothing is visible rather than silently
leaving the outdoor card empty.

Sunrise and sunset are computed from the resolved coordinates and rendered in the
*location's* timezone when the geocoder (or NWS) reports one; entering raw
coordinates on a host in a different timezone falls back to the host's clock.

## API

| Route | Purpose |
|---|---|
| `GET /api/config` | rooms, metrics, thresholds, mode |
| `GET /api/rooms` | current snapshot + fleet health |
| `GET /api/history?entities=&hours=&points=` | ≤48 h: raw points; >48 h: hourly mean/min/max |
| `GET/PUT /api/thresholds` | effective + default comfort bands; PUT persists overrides |
| `GET/PUT /api/settings` | location + temperature scale; PUT resolves and caches the station |
| `GET /api/outdoor` | outdoor conditions, indoor/outdoor deltas, ventilation verdict — **204** when no location is set |
| `GET /api/insights` | the "what happened today" feed, recomputed every 5 min |
| `GET/PUT /api/layout` | persisted card order/size — retained for compatibility; the UI no longer calls it |
| `WS /api/stream` | live state pushes, plus an `insights` nudge when the feed changes |
| `GET /api/health` | mode + liveness |

## Tests & screenshots

```sh
cd backend && .venv/bin/python -m pytest tests -q     # simulator + API tests
cd frontend && npm run typecheck && npm run build
python3 ../scripts/screenshot.py --out /tmp/shots     # Playwright page matrix
```

## Notes on the weather integration

`providers/weather.py` talks to `api.weather.gov` and `*.open-meteo.com`. Like
`providers/ha.py`, it cannot be exercised against the live services from CI, so
`tests/test_weather.py` drives it entirely with canned payloads — the tests that
matter most are the ones proving a missing, partial or broken response yields
`None` rather than an exception or an invented reading. The first real fetch
happens on the Docker host. NWS requires a descriptive `User-Agent` (set in the
module) and covers the US only; outside it the Open-Meteo forecast model is used
and labelled as a model grid cell, never as a station.

## Future work (deliberately not in v1)

- InfluxDB-backed history (HA long-term statistics covers current needs)
- PWA/kiosk installability for the wall tablet
- New card *types* beyond the config-driven set
