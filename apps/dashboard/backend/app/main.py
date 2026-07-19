"""App factory: pick a provider (demo simulator or real HA), start its run
task, expose the API, and serve the built frontend when it exists."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import settings
from .config import build_effective_thresholds, load_config
from .providers.sim import SimProvider
from .routes import load_threshold_overrides, router
from .stream import hub


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.bind_loop()
    task = asyncio.create_task(app.state.provider.run())
    yield
    task.cancel()


def create_app() -> FastAPI:
    config = load_config(settings.CONFIG_PATH)
    # Comfort bands are user-tunable at runtime (PUT /api/thresholds). The
    # pristine config.yaml values stay as `default_thresholds` (for reset);
    # config.thresholds becomes the effective set the whole app serves.
    default_thresholds = {metric: dict(t) for metric, t in config.thresholds.items()}
    try:
        config.thresholds = build_effective_thresholds(default_thresholds, load_threshold_overrides())
    except (ValueError, TypeError, KeyError):
        # A stale/incompatible override file must never break startup —
        # fall back to config defaults and let the user re-save.
        config.thresholds = default_thresholds
    if settings.DEMO_MODE:
        provider = SimProvider(config)
    else:
        from .providers.ha import HAProvider

        provider = HAProvider(config, settings.HA_BASE_URL, settings.HA_TOKEN)
    provider.subscribe(hub.publish)

    app = FastAPI(title="Home-Hub Dashboard", lifespan=lifespan)
    app.state.config = config
    app.state.default_thresholds = default_thresholds
    app.state.provider = provider
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # vite dev
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    if settings.STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=settings.STATIC_DIR, html=True), name="static")

        @app.exception_handler(StarletteHTTPException)
        async def spa_fallback(request: Request, exc: StarletteHTTPException):
            # Client-side routes (/room/kitchen, /system) resolve to index.html
            if exc.status_code == 404 and request.method == "GET" and not request.url.path.startswith("/api"):
                return FileResponse(settings.STATIC_DIR / "index.html")
            return await http_exception_handler(request, exc)

    return app


app = create_app()
