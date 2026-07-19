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
- **Drag-and-drop layout**: an Edit mode lets you reorder and resize room
  cards; the layout persists server-side (`data/layout.json`) — no source
  edits, no accounts (single-household, layout is global).
- **Editable comfort bands**: the header's gear opens a settings dialog to tune
  the temperature and humidity Good/Fair/Poor bands live; overrides persist
  server-side (`data/thresholds.json`) and layer over the `config.yaml`
  defaults, so un-tuned metrics keep tracking config.
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

Temperature and humidity comfort bands are also tunable at runtime from the
dashboard (the header gear → **Comfort settings**). Those overrides are saved to
`data/thresholds.json` and merged over the `config.yaml` defaults on every
start; delete that file to fall back to config.

## API

| Route | Purpose |
|---|---|
| `GET /api/config` | rooms, metrics, thresholds, mode |
| `GET /api/rooms` | current snapshot + fleet health |
| `GET /api/history?entities=&hours=&points=` | ≤48 h: raw points; >48 h: hourly mean/min/max |
| `GET/PUT /api/layout` | persisted card order/size (drag-and-drop backing store) |
| `GET/PUT /api/thresholds` | effective + default comfort bands; PUT persists overrides |
| `WS /api/stream` | live state pushes |
| `GET /api/health` | mode + liveness |

## Tests & screenshots

```sh
cd backend && .venv/bin/python -m pytest tests -q     # simulator + API tests
cd frontend && npm run typecheck && npm run build
python3 ../scripts/screenshot.py --out /tmp/shots     # Playwright page matrix
```

## Future work (deliberately not in v1)

- InfluxDB-backed history (HA long-term statistics covers current needs)
- PWA/kiosk installability for the wall tablet
- New card *types* beyond the config-driven set
