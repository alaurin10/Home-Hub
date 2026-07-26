"""Outdoor context from public weather stations.

There is no outdoor sensor node in the fleet and there is not going to be one.
The user types a location in Settings; this module resolves it and reads the
nearest *official* observation station. Everything here is keyless — no account,
no secret in the repo, outbound HTTPS only:

  - geocoding      Open-Meteo geocoding API (also accepts a raw "lat,lon")
  - observations   NWS api.weather.gov — the nearest real station (KBOS · 2.4 mi)
  - air quality    Open-Meteo air-quality API (AQI + PM2.5)
  - fallback       Open-Meteo forecast API, outside NWS coverage (US only)
  - sun times      computed locally from lat/lon (NOAA equations, no network)

Like providers/ha.py this cannot be exercised against the live services from CI;
the tests drive it with canned payloads. Every failure path returns None so the
route 204s and the UI simply omits the outdoor card — a weather outage must
never take the dashboard down.
"""

import asyncio
import math
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Protocol

import httpx

from .. import settings

# NWS asks for a descriptive User-Agent identifying the application and a
# contact; it 403s generic ones. https://www.weather.gov/documentation/services-web-api
USER_AGENT = "home-hub-dashboard (https://github.com/alaurin10/home-hub)"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
NWS_POINTS_URL = "https://api.weather.gov/points"

CACHE_TTL_S = 600.0  # weather does not move faster than 10 minutes
TIMEOUT_S = 10.0

COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


@dataclass
class Place:
    latitude: float
    longitude: float
    label: str            # "Cambridge, Massachusetts, US" — echoed back to the user


@dataclass
class OutdoorReading:
    temp: float | None = None         # °F
    humidity: float | None = None     # %
    wind: float | None = None         # mph
    wind_dir: str | None = None       # "NW"
    aqi: float | None = None          # US AQI
    pm2_5: float | None = None        # µg/m³
    sunrise: str | None = None        # "5:18 AM", host-local
    sunset: str | None = None
    station: str | None = None        # "KBOS · 2.4 mi"
    source: str = ""
    observed_at: float | None = None


class OutdoorProvider(Protocol):
    async def fetch(self, place: Place) -> OutdoorReading | None: ...


# --- unit helpers ---------------------------------------------------------

def c_to_f(celsius: float) -> float:
    return celsius * 9.0 / 5.0 + 32.0


def kmh_to_mph(kmh: float) -> float:
    return kmh * 0.621371


def ms_to_mph(ms: float) -> float:
    return ms * 2.236936


def compass(bearing: float | None) -> str | None:
    """Meteorological bearing (the direction wind comes *from*) to 16-point."""
    if bearing is None:
        return None
    return COMPASS[int((bearing % 360) / 22.5 + 0.5) % 16]


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613  # mean Earth radius, miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _num(value: Any) -> float | None:
    """NWS reports every observed quantity as {"value": x|null, "unitCode": ...}
    and freely nulls individual fields, so nothing here may assume a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return float(value)


def _nws_quantity(prop: Any, converters: dict[str, Any]) -> float | None:
    """Read one NWS quantity, converting by its declared unitCode."""
    if not isinstance(prop, dict):
        return None
    value = _num(prop.get("value"))
    if value is None:
        return None
    unit = str(prop.get("unitCode", "")).split(":")[-1]
    convert = converters.get(unit)
    return convert(value) if convert else value


# --- sun times ------------------------------------------------------------

def sun_times(latitude: float, longitude: float, on: date | None = None) -> tuple[str | None, str | None]:
    """Local sunrise/sunset as "5:18 AM" strings, from the NOAA sunrise equation.

    Computed rather than fetched: it needs no network, is exact enough for a
    dashboard caption, and keeps one fewer request in the 10-minute poll. Polar
    day/night returns (None, None) rather than a fabricated time."""
    on = on or datetime.now().date()
    n = on.toordinal() - date(2000, 1, 1).toordinal() + 0.0008
    j_star = n - longitude / 360.0
    m = (357.5291 + 0.98560028 * j_star) % 360.0
    m_rad = math.radians(m)
    center = 1.9148 * math.sin(m_rad) + 0.0200 * math.sin(2 * m_rad) + 0.0003 * math.sin(3 * m_rad)
    ecliptic_lon = math.radians((m + center + 180.0 + 102.9372) % 360.0)
    j_transit = 2451545.0 + j_star + 0.0053 * math.sin(m_rad) - 0.0069 * math.sin(2 * ecliptic_lon)
    declination = math.asin(math.sin(ecliptic_lon) * math.sin(math.radians(23.4397)))

    lat_rad = math.radians(latitude)
    # -0.833° accounts for refraction and the solar disc's radius.
    cos_omega = (
        math.sin(math.radians(-0.833)) - math.sin(lat_rad) * math.sin(declination)
    ) / (math.cos(lat_rad) * math.cos(declination))
    if not -1.0 <= cos_omega <= 1.0:
        return None, None  # sun never rises or never sets at this latitude today
    omega = math.degrees(math.acos(cos_omega))

    def _local(julian: float) -> str:
        # Julian day -> UTC instant -> the host's local clock, which is the
        # timezone every other time in this app is reasoned in.
        unix = (julian - 2440587.5) * 86400.0
        return datetime.fromtimestamp(unix, tz=timezone.utc).astimezone().strftime("%-I:%M %p")

    return _local(j_transit - omega / 360.0), _local(j_transit + omega / 360.0)


# --- the real provider ----------------------------------------------------

async def _get(client: httpx.AsyncClient, url: str, **kwargs) -> Any | None:
    """Any transport/HTTP/JSON failure degrades that source to "absent" — never
    an exception out of this module."""
    try:
        resp = await client.get(url, timeout=TIMEOUT_S, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


async def geocode(query: str) -> Place | None:
    """Resolve what the user typed in Settings. Accepts a place name or a raw
    "lat,lon". Returns None when nothing matched, which the UI shows back so a
    typo is visible rather than silently leaving the card empty."""
    query = (query or "").strip()
    if not query:
        return None
    direct = _parse_latlon(query)
    if direct:
        return Place(latitude=direct[0], longitude=direct[1], label=query)

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        attempts: list[tuple[str, str | None]] = [(query, None)]
        # "Cambridge, MA" often misses as one string; retry on the city with the
        # remainder used to pick the right hit among many "Cambridge"s.
        if "," in query:
            head, _, tail = query.partition(",")
            attempts.append((head.strip(), tail.strip()))
        for name, qualifier in attempts:
            data = await _get(
                client, GEOCODE_URL, params={"name": name, "count": 10, "language": "en", "format": "json"}
            )
            hit = _pick_result((data or {}).get("results") or [], qualifier)
            if hit:
                return Place(
                    latitude=float(hit["latitude"]),
                    longitude=float(hit["longitude"]),
                    label=_place_label(hit),
                )
    return None


class StationOutdoorProvider:
    """NWS observations + Open-Meteo air quality, with an Open-Meteo fallback
    outside NWS coverage. Station resolution is cached: the nearest station for a
    location does not change, so the 10-minute poll only re-reads the
    observation."""

    def __init__(self) -> None:
        self._station: dict[tuple[float, float], tuple[str, float, float, str] | None] = {}

    async def _resolve_station(
        self, client: httpx.AsyncClient, place: Place
    ) -> tuple[str, float, float, str] | None:
        """(station_id, lat, lon, name) of the nearest NWS observation station,
        or None outside NWS coverage."""
        key = (round(place.latitude, 3), round(place.longitude, 3))
        if key in self._station:
            return self._station[key]
        point = await _get(client, f"{NWS_POINTS_URL}/{place.latitude:.4f},{place.longitude:.4f}")
        stations_url = ((point or {}).get("properties") or {}).get("observationStations")
        resolved = None
        if stations_url:
            listing = await _get(client, stations_url)
            # NWS returns the list already ordered by proximity to the point.
            for feature in ((listing or {}).get("features") or [])[:1]:
                props = feature.get("properties") or {}
                coords = (feature.get("geometry") or {}).get("coordinates") or []
                if props.get("stationIdentifier") and len(coords) == 2:
                    resolved = (
                        str(props["stationIdentifier"]),
                        float(coords[1]),
                        float(coords[0]),
                        str(props.get("name") or ""),
                    )
        self._station[key] = resolved
        return resolved

    async def fetch(self, place: Place) -> OutdoorReading | None:
        sunrise, sunset = sun_times(place.latitude, place.longitude)
        async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
            station = await self._resolve_station(client, place)
            observation = None
            if station:
                station_id = station[0]
                observation = await _get(
                    client, f"https://api.weather.gov/stations/{station_id}/observations/latest"
                )
            air = await _get(
                client,
                AIR_QUALITY_URL,
                params={
                    "latitude": place.latitude,
                    "longitude": place.longitude,
                    "current": "pm2_5,us_aqi",
                    "timezone": "auto",
                },
            )
            reading = _from_nws(observation, station, place) if observation else None
            if reading is None:
                # Outside NWS coverage (or the station is silent): fall back to
                # the model, and say so rather than implying a station reading.
                forecast = await _get(
                    client,
                    FORECAST_URL,
                    params={
                        "latitude": place.latitude,
                        "longitude": place.longitude,
                        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
                        "temperature_unit": "fahrenheit",
                        "wind_speed_unit": "mph",
                        "timezone": "auto",
                    },
                )
                reading = _from_open_meteo(forecast, place)

        if reading is None:
            return None
        current = (air or {}).get("current") or {}
        reading.aqi = _num(current.get("us_aqi"))
        reading.pm2_5 = _num(current.get("pm2_5"))
        reading.sunrise, reading.sunset = sunrise, sunset
        return reading


def _parse_latlon(query: str) -> tuple[float, float] | None:
    parts = query.split(",")
    if len(parts) != 2:
        return None
    try:
        lat, lon = float(parts[0].strip()), float(parts[1].strip())
    except ValueError:
        return None
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon
    return None


def _pick_result(results: list[dict], qualifier: str | None) -> dict | None:
    """First hit, unless a qualifier ("MA", "Massachusetts", "US") picks another."""
    if not results:
        return None
    if qualifier:
        wanted = qualifier.strip().lower()
        for hit in results:
            candidates = {
                str(hit.get("admin1", "")).lower(),
                str(hit.get("country", "")).lower(),
                str(hit.get("country_code", "")).lower(),
            }
            if wanted in candidates or any(c.startswith(wanted) for c in candidates if c):
                return hit
    return results[0]


def _place_label(hit: dict) -> str:
    parts = [hit.get("name"), hit.get("admin1"), hit.get("country_code")]
    return ", ".join(str(p) for p in parts if p)


def _station_label(station: tuple[str, float, float, str], place: Place) -> str:
    station_id, lat, lon, _name = station
    miles = haversine_miles(place.latitude, place.longitude, lat, lon)
    return f"{station_id} · {miles:.1f} mi"


def _from_nws(payload: dict, station: tuple[str, float, float, str] | None, place: Place) -> OutdoorReading | None:
    props = (payload or {}).get("properties") or {}
    temp = _nws_quantity(props.get("temperature"), {"degC": c_to_f, "degF": lambda v: v})
    humidity = _nws_quantity(props.get("relativeHumidity"), {"percent": lambda v: v})
    wind = _nws_quantity(
        props.get("windSpeed"), {"km_h-1": kmh_to_mph, "m_s-1": ms_to_mph, "mi_h-1": lambda v: v}
    )
    bearing = _nws_quantity(props.get("windDirection"), {})
    if temp is None and humidity is None:
        # A station that reports neither is not worth showing as a station.
        return None
    observed = props.get("timestamp")
    return OutdoorReading(
        temp=round(temp, 1) if temp is not None else None,
        humidity=round(humidity) if humidity is not None else None,
        wind=round(wind) if wind is not None else None,
        wind_dir=compass(bearing),
        station=_station_label(station, place) if station else None,
        source=f"{station[3] or station[0]} (NWS)" if station else "NWS",
        observed_at=_iso_to_ts(observed) if observed else None,
    )


def _from_open_meteo(payload: dict | None, place: Place) -> OutdoorReading | None:
    current = (payload or {}).get("current") or {}
    temp = _num(current.get("temperature_2m"))
    humidity = _num(current.get("relative_humidity_2m"))
    if temp is None and humidity is None:
        return None
    return OutdoorReading(
        temp=round(temp, 1) if temp is not None else None,
        humidity=round(humidity) if humidity is not None else None,
        wind=round(w) if (w := _num(current.get("wind_speed_10m"))) is not None else None,
        wind_dir=compass(_num(current.get("wind_direction_10m"))),
        station=f"{place.label} · model grid",
        source="Open-Meteo forecast model (no station in range)",
    )


def _iso_to_ts(iso: str) -> float | None:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


# --- the simulator --------------------------------------------------------

class SimOutdoorProvider:
    """A deterministic outdoor day for demo mode, so the dashboard tells a whole
    story before a location is set. Seeded from SIM_SEED like the sensor
    simulator, and clearly labelled as simulated — it must never be mistaken for
    a real station reading."""

    async def fetch(self, place: Place) -> OutdoorReading | None:
        now = datetime.now()
        hod = now.hour + now.minute / 60.0
        wobble = (settings.SIM_SEED % 7) - 3
        temp = 66.0 + 9.0 * math.sin(2 * math.pi * (hod - 9.8) / 24.0) + wobble * 0.4
        humidity = 61.0 - 11.0 * math.sin(2 * math.pi * (hod - 9.8) / 24.0)
        sunrise, sunset = sun_times(place.latitude, place.longitude)
        return OutdoorReading(
            temp=round(temp, 1),
            humidity=round(humidity),
            wind=6,
            wind_dir="NW",
            aqi=22,
            pm2_5=5.1,
            sunrise=sunrise,
            sunset=sunset,
            station="Simulated · demo mode",
            source="Simulated outdoor conditions — set a location in Settings for real data.",
            observed_at=time.time(),
        )


# --- cache ----------------------------------------------------------------

@dataclass
class OutdoorCache:
    """One in-flight fetch at a time and one cached answer for CACHE_TTL_S, so N
    open dashboards cost the upstream services one request per 10 minutes."""

    provider: Any
    reading: OutdoorReading | None = None
    place: Place | None = None
    fetched_at: float = 0.0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def get(self, place: Place | None) -> OutdoorReading | None:
        if place is None:
            return None
        async with self._lock:
            fresh = time.time() - self.fetched_at < CACHE_TTL_S
            same = self.place == place
            if fresh and same and self.reading is not None:
                return self.reading
            reading = await self.provider.fetch(place)
            # Keep the last good reading on a transient failure rather than
            # blinking the card out; only its age changes.
            if reading is not None:
                self.reading, self.place, self.fetched_at = reading, place, time.time()
            elif not same:
                self.reading, self.place, self.fetched_at = None, place, time.time()
            return self.reading

    def invalidate(self) -> None:
        self.reading, self.place, self.fetched_at = None, None, 0.0


# --- ventilation advice ---------------------------------------------------

# The three conditions the "Do now" insight cites, evaluated once here so the
# card and the feed can never disagree about whether opening a window helps.
AQI_CLEAN_MAX = 50.0        # US AQI "good"
TEMP_GAP_MAX_F = 14.0       # beyond this the heat cost outweighs the air swap


def ventilation_advice(rooms: Any, reading: OutdoorReading, config: Any) -> Any:
    """Is outside actually better than inside right now?

    True only when the worst room is over its CO₂ target AND outdoor AQI is
    clean AND the indoor/outdoor temperature gap is small. Any missing input
    means "we don't know", which reads as not recommended — never as yes."""
    from ..models import Ventilation  # local: keeps providers/ import-light

    co2_target = ((config.thresholds.get("co2") or {}).get("bounds") or [800])[0]
    worst = None
    for room in rooms.rooms:
        if not room.node.online:
            continue
        co2 = (room.metrics.get("co2").value if room.metrics.get("co2") else None)
        if co2 is None:
            continue
        if worst is None or co2 > worst[1]:
            temp = room.metrics.get("temperature")
            worst = (room.name, co2, temp.value if temp else None)

    if worst is None or reading.temp is None:
        return Ventilation(
            recommended=False,
            title="Not enough to say",
            body="No room is reporting CO₂ and a temperature right now, so there is nothing to compare outside against.",
        )

    name, co2, indoor_temp = worst
    gap = abs(reading.temp - indoor_temp) if indoor_temp is not None else None
    clean = reading.aqi is not None and reading.aqi < AQI_CLEAN_MAX
    mild = gap is not None and gap < TEMP_GAP_MAX_F

    if co2 <= co2_target:
        return Ventilation(
            recommended=False,
            title="No need right now",
            body=f"The stuffiest room ({name}) is at {co2:,.0f} ppm, already under the {co2_target:,.0f} ppm target.",
        )
    if not clean:
        aqi_text = f"AQI {reading.aqi:.0f}" if reading.aqi is not None else "no AQI reading"
        return Ventilation(
            recommended=False,
            title="Keep the windows shut",
            body=f"{name} is at {co2:,.0f} ppm, but outside reads {aqi_text} — opening up would trade CO₂ for particulates.",
        )
    if not mild:
        gap_text = f"{gap:.0f} °F" if gap is not None else "an unknown amount"
        return Ventilation(
            recommended=False,
            title="Costly right now",
            body=f"{name} is at {co2:,.0f} ppm and the air outside is clean, but it is {gap_text} away from indoors — worth waiting for a smaller gap.",
        )
    return Ventilation(
        recommended=True,
        title="Good time to open up",
        body=(
            f"Outside is cleaner and only {gap:.0f} °F from the {name.lower()}. "
            "Ten minutes of cross-ventilation clears the CO₂ without losing much heat."
        ),
    )


def build_outdoor_provider() -> Any:
    """Demo mode gets the simulated curve, real mode reads stations. Neither
    invents a location: with none set, /api/outdoor 204s in both modes and the
    UI asks for one instead of showing a plausible fiction."""
    return SimOutdoorProvider() if settings.DEMO_MODE else StationOutdoorProvider()
