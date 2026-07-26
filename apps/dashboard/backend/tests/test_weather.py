"""Outdoor provider: unit conversion, station resolution, sun times, and the
degrade-to-nothing paths.

Nothing here touches the network. Like providers/ha.py, the live services cannot
be exercised from CI — so every upstream response is a canned payload, and the
tests that matter most are the ones proving a missing or broken response yields
None rather than an exception or a fabricated reading.
"""

from datetime import date

import pytest

from app.models import Ventilation
from app.providers import weather
from app.providers.weather import (
    OutdoorCache,
    OutdoorReading,
    Place,
    SimOutdoorProvider,
    StationOutdoorProvider,
    _from_nws,
    _from_open_meteo,
    _pick_result,
    compass,
    haversine_miles,
    sun_times,
    ventilation_advice,
)

CAMBRIDGE = Place(latitude=42.3751, longitude=-71.1056, label="Cambridge, Massachusetts, US")
# KBOS (Logan) sits ~5 mi east of Cambridge — the real geometry behind the label.
KBOS = ("KBOS", 42.3606, -71.0097, "Boston, Logan International Airport")

NWS_OBSERVATION = {
    "properties": {
        "timestamp": "2026-07-25T21:54:00+00:00",
        "temperature": {"value": 19.4, "unitCode": "wmoUnit:degC"},
        "relativeHumidity": {"value": 59.0, "unitCode": "wmoUnit:percent"},
        "windSpeed": {"value": 9.36, "unitCode": "wmoUnit:km_h-1"},
        "windDirection": {"value": 320, "unitCode": "wmoUnit:degree_(angle)"},
    }
}


def test_nws_observation_maps_and_converts_units():
    reading = _from_nws(NWS_OBSERVATION, KBOS, CAMBRIDGE)
    assert reading.temp == pytest.approx(66.9, abs=0.05)   # 19.4 °C
    assert reading.humidity == 59
    assert reading.wind == 6                                # 9.36 km/h -> 5.8 mph
    assert reading.wind_dir == "NW"                         # 320°
    assert reading.station.startswith("KBOS · ")
    assert "NWS" in reading.source
    assert reading.observed_at is not None


def test_nws_fahrenheit_stations_are_not_double_converted():
    payload = {"properties": {"temperature": {"value": 71.0, "unitCode": "wmoUnit:degF"}}}
    assert _from_nws(payload, KBOS, CAMBRIDGE).temp == 71.0


def test_nws_nulls_individual_fields_without_losing_the_reading():
    payload = {
        "properties": {
            "temperature": {"value": 19.4, "unitCode": "wmoUnit:degC"},
            "relativeHumidity": {"value": None, "unitCode": "wmoUnit:percent"},
            "windSpeed": {"value": None, "unitCode": "wmoUnit:km_h-1"},
            "windDirection": None,
        }
    }
    reading = _from_nws(payload, KBOS, CAMBRIDGE)
    assert reading.temp is not None
    assert reading.humidity is None and reading.wind is None and reading.wind_dir is None


def test_nws_station_with_nothing_useful_is_not_a_reading():
    # Falls through to the model fallback rather than rendering an empty card.
    payload = {"properties": {"temperature": {"value": None}, "relativeHumidity": {"value": None}}}
    assert _from_nws(payload, KBOS, CAMBRIDGE) is None


def test_station_distance_is_the_real_geometry():
    label = _from_nws(NWS_OBSERVATION, KBOS, CAMBRIDGE).station
    miles = float(label.split("·")[1].strip().split(" ")[0])
    assert 4.5 < miles < 5.5
    assert haversine_miles(42.3751, -71.1056, 42.3751, -71.1056) == 0


def test_open_meteo_fallback_labels_itself_as_a_model():
    payload = {
        "current": {
            "temperature_2m": 66.9,
            "relative_humidity_2m": 59,
            "wind_speed_10m": 5.8,
            "wind_direction_10m": 320,
        }
    }
    reading = _from_open_meteo(payload, CAMBRIDGE)
    assert reading.temp == 66.9 and reading.humidity == 59 and reading.wind == 6
    # It must never imply a station reading it did not take.
    assert "model" in reading.station and "model" in reading.source


def test_open_meteo_fallback_with_nothing_returns_none():
    assert _from_open_meteo({"current": {}}, CAMBRIDGE) is None
    assert _from_open_meteo(None, CAMBRIDGE) is None


@pytest.mark.parametrize(
    "bearing,expected", [(0, "N"), (90, "E"), (180, "S"), (270, "W"), (320, "NW"), (359, "N")]
)
def test_compass_points(bearing, expected):
    assert compass(bearing) == expected
    assert compass(None) is None


def test_sun_times_across_the_year():
    june = sun_times(42.3751, -71.1056, date(2026, 6, 21))
    december = sun_times(42.3751, -71.1056, date(2026, 12, 21))
    assert all(june) and all(december)
    assert june != december
    # Both render as a readable local clock time.
    assert june[0].endswith(("AM", "PM"))


def test_sun_times_handle_the_polar_day():
    # Svalbard in midsummer: the sun does not set. (None, None) beats a made-up time.
    assert sun_times(78.2, 15.6, date(2026, 6, 21)) == (None, None)


def test_geocode_accepts_raw_coordinates_without_a_network_call(monkeypatch):
    import asyncio

    def explode(*args, **kwargs):
        raise AssertionError("raw lat,lon must not hit the network")

    monkeypatch.setattr(weather, "_get", explode)
    place = asyncio.run(weather.geocode("42.3751, -71.1056"))
    assert place.latitude == 42.3751 and place.longitude == -71.1056


def test_geocode_qualifier_picks_the_right_hit():
    results = [
        {"name": "Cambridge", "latitude": 52.2, "longitude": 0.12, "admin1": "England", "country_code": "GB"},
        {"name": "Cambridge", "latitude": 42.37, "longitude": -71.1, "admin1": "Massachusetts", "country_code": "US"},
    ]
    assert _pick_result(results, "MA")["country_code"] == "US"
    assert _pick_result(results, None)["country_code"] == "GB"  # relevance order wins
    assert _pick_result([], "MA") is None


def test_geocode_returns_none_when_nothing_matches(monkeypatch):
    import asyncio

    async def empty(client, url, **kwargs):
        return {"results": []}

    monkeypatch.setattr(weather, "_get", empty)
    assert asyncio.run(weather.geocode("Nowhere at all")) is None
    assert asyncio.run(weather.geocode("   ")) is None


def test_provider_survives_every_upstream_failing(monkeypatch):
    import asyncio

    async def dead(client, url, **kwargs):
        return None

    monkeypatch.setattr(weather, "_get", dead)
    assert asyncio.run(StationOutdoorProvider().fetch(CAMBRIDGE)) is None


def test_provider_still_reports_when_only_air_quality_answers(monkeypatch):
    import asyncio

    async def fake(client, url, **kwargs):
        if "air-quality" in url:
            return {"current": {"us_aqi": 22, "pm2_5": 5.1}}
        if "forecast" in url:
            return {"current": {"temperature_2m": 66.9, "relative_humidity_2m": 59}}
        return None  # NWS is down

    monkeypatch.setattr(weather, "_get", fake)
    reading = asyncio.run(StationOutdoorProvider().fetch(CAMBRIDGE))
    assert reading.aqi == 22 and reading.pm2_5 == 5.1
    assert reading.temp == 66.9
    assert reading.sunrise and reading.sunset


def test_sim_provider_labels_itself_as_simulated():
    import asyncio

    reading = asyncio.run(SimOutdoorProvider().fetch(CAMBRIDGE))
    assert "Simulated" in reading.station
    assert reading.aqi == 22
    assert 40 <= reading.temp <= 90


def test_cache_serves_one_upstream_read_per_window():
    import asyncio

    class Counting:
        calls = 0

        async def fetch(self, place):
            Counting.calls += 1
            return OutdoorReading(temp=70.0)

    cache = OutdoorCache(provider=Counting())
    asyncio.run(cache.get(CAMBRIDGE))
    asyncio.run(cache.get(CAMBRIDGE))
    assert Counting.calls == 1
    assert asyncio.run(cache.get(None)) is None
    cache.invalidate()
    asyncio.run(cache.get(CAMBRIDGE))
    assert Counting.calls == 2


def test_cache_keeps_the_last_good_reading_through_a_blip():
    import asyncio

    class Flaky:
        answers = [OutdoorReading(temp=70.0), None]

        async def fetch(self, place):
            return Flaky.answers.pop(0)

    cache = OutdoorCache(provider=Flaky())
    assert asyncio.run(cache.get(CAMBRIDGE)).temp == 70.0
    cache.fetched_at = 0.0  # force a refetch; it fails
    assert asyncio.run(cache.get(CAMBRIDGE)).temp == 70.0  # card does not blink out


# --- ventilation verdict --------------------------------------------------

class _FakeMetric:
    def __init__(self, value):
        self.value = value


class _FakeNode:
    def __init__(self, online=True):
        self.online = online


class _FakeRoom:
    def __init__(self, name, co2, temp, online=True):
        self.name = name
        self.metrics = {"co2": _FakeMetric(co2), "temperature": _FakeMetric(temp)}
        self.node = _FakeNode(online)


class _FakeRooms:
    def __init__(self, rooms):
        self.rooms = rooms


class _FakeConfig:
    thresholds = {"co2": {"bounds": [800, 1200, 2000]}}


def _verdict(co2, outdoor_temp, aqi, indoor_temp=72.0) -> Ventilation:
    rooms = _FakeRooms([_FakeRoom("Kitchen", co2, indoor_temp)])
    return ventilation_advice(rooms, OutdoorReading(temp=outdoor_temp, aqi=aqi), _FakeConfig())


def test_ventilation_recommended_when_all_three_conditions_hold():
    verdict = _verdict(co2=1140, outdoor_temp=67, aqi=22)
    assert verdict.recommended is True
    assert "open up" in verdict.title.lower()


def test_ventilation_declined_when_air_outside_is_dirty():
    assert _verdict(co2=1140, outdoor_temp=67, aqi=120).recommended is False


def test_ventilation_declined_when_the_temperature_gap_is_large():
    assert _verdict(co2=1140, outdoor_temp=40, aqi=22).recommended is False


def test_ventilation_declined_when_nothing_is_stuffy():
    assert _verdict(co2=620, outdoor_temp=67, aqi=22).recommended is False


def test_ventilation_declined_when_aqi_is_unknown():
    # Missing input means "we don't know", which must never read as yes.
    assert _verdict(co2=1140, outdoor_temp=67, aqi=None).recommended is False


def test_ventilation_ignores_offline_rooms():
    rooms = _FakeRooms([_FakeRoom("Bedroom", 2000, 72.0, online=False)])
    verdict = ventilation_advice(rooms, OutdoorReading(temp=67, aqi=22), _FakeConfig())
    assert verdict.recommended is False
    assert "Not enough" in verdict.title
