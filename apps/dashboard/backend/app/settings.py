"""Environment configuration. Demo mode is the default whenever no HA token
is provided, so a fresh checkout runs standalone."""

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent.parent  # apps/dashboard/

HA_BASE_URL = os.environ.get("HA_BASE_URL", "").rstrip("/")
HA_TOKEN = os.environ.get("HA_TOKEN", "")
DEMO_MODE = os.environ.get("DEMO_MODE", "").lower() in ("1", "true", "yes") or not HA_TOKEN
SIM_SEED = int(os.environ.get("SIM_SEED", "42"))
SIM_FAULT = os.environ.get("SIM_FAULT", "")  # room id to render as a stale node
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", APP_DIR / "config.yaml"))
DATA_DIR = Path(os.environ.get("DATA_DIR", APP_DIR / "data"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", APP_DIR / "frontend" / "dist"))
