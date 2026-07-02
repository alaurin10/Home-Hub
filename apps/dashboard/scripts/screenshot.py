#!/usr/bin/env python3
"""Screenshot harness: renders the app page matrix (viewport x color-scheme x
route) to PNGs. The forever preview loop for dashboard design changes.

    python3 scripts/screenshot.py --base http://127.0.0.1:5173 --out shots/

Requires `pip install playwright` and a Chromium (PLAYWRIGHT_BROWSERS_PATH or
--executable to point at an existing binary).
"""

import argparse
import glob
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "phone": {"width": 390, "height": 844},
}
PAGES = {
    "home": "/",
    "room": "/room/kitchen",
    "system": "/system",
}


def find_chromium() -> str | None:
    """Fall back to any pre-installed Chromium if the Playwright package's
    pinned browser build is missing."""
    root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")
    if not root:
        return None
    for pattern in ("chromium-*/chrome-linux/chrome", "chromium*/chrome-linux/chrome"):
        hits = glob.glob(os.path.join(root, pattern))
        if hits:
            return sorted(hits)[-1]
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:5173")
    parser.add_argument("--out", default="shots")
    parser.add_argument("--executable", default=None)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(executable_path=args.executable)
        except Exception:
            fallback = find_chromium()
            if not fallback:
                raise
            browser = pw.chromium.launch(executable_path=fallback)

        for scheme in ("light", "dark"):
            for vp_name, viewport in VIEWPORTS.items():
                context = browser.new_context(viewport=viewport, color_scheme=scheme)
                page = context.new_page()
                for page_name, path in PAGES.items():
                    page.goto(args.base + path)
                    page.wait_for_selector("html[data-loaded='1']", timeout=15000)
                    page.wait_for_timeout(1800)  # charts finish their draw-in
                    target = out / f"{page_name}-{vp_name}-{scheme}.png"
                    page.screenshot(path=str(target))
                    print(target)
                context.close()
        browser.close()


if __name__ == "__main__":
    main()
