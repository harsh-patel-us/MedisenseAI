"""
wearable_parser_service.py — Parse Apple Health, Fitbit, and Google Fit
exports into one standardized stats dictionary.

Output schema (every parser returns the same shape; missing metrics are
left as `None` / empty so the AI narrative prompt can degrade gracefully):

    {
        "source": "apple_health" | "fitbit" | "google_fit",
        "date_range": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
        "heart_rate": {
            "avg": float | None,
            "min": float | None,
            "max": float | None,
            "resting_avg": float | None,
            "daily_readings": [{"date": "YYYY-MM-DD", "avg": float, ...}]
        },
        "spo2": {
            "avg": float | None,
            "min": float | None,
            "readings_below_94": [{"date": ..., "value": float}],
        },
        "steps": {
            "daily_avg": float | None,
            "total": int | None,
            "days_above_8000": int,
        },
        "sleep": {"avg_hours": float | None, "nights_below_6": int},
        "weight": {"latest_kg": float | None, "change_kg": float | None},
        "blood_glucose": {"readings": [{"date": ..., "value": float}]},
        "errors": [str],          # parser warnings, never fatal
        "raw_record_count": int,
    }

Robustness contract: parsers MUST NOT raise on partially-corrupted data —
they extract what they can, append a string to `errors`, and keep going.
The router shows `errors` to the patient verbatim.
"""
from __future__ import annotations

import io
import json
import logging
import statistics
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────


def _empty_stats(source: str) -> dict[str, Any]:
    return {
        "source": source,
        "date_range": {"start": None, "end": None},
        "heart_rate": {
            "avg": None,
            "min": None,
            "max": None,
            "resting_avg": None,
            "daily_readings": [],
        },
        "spo2": {"avg": None, "min": None, "readings_below_94": []},
        "steps": {"daily_avg": None, "total": None, "days_above_8000": 0},
        "sleep": {"avg_hours": None, "nights_below_6": 0},
        "weight": {"latest_kg": None, "change_kg": None},
        "blood_glucose": {"readings": []},
        "errors": [],
        "raw_record_count": 0,
    }


def _safe_round(value: Optional[float], digits: int = 1) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _date_only(s: str | None) -> Optional[str]:
    """Extract YYYY-MM-DD from a varying date / datetime input."""
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    # Apple Health: "2025-04-12 09:14:32 +0000"
    if " " in s:
        s = s.split(" ", 1)[0]
    # ISO-8601 with T
    if "T" in s:
        s = s.split("T", 1)[0]
    # Bail out gracefully if it isn't date-like.
    if len(s) < 8:
        return None
    return s[:10]


def _parse_iso(s: str | None) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _update_range(stats: dict[str, Any], date_str: Optional[str]) -> None:
    if not date_str:
        return
    cur = stats["date_range"]
    if cur["start"] is None or date_str < cur["start"]:
        cur["start"] = date_str
    if cur["end"] is None or date_str > cur["end"]:
        cur["end"] = date_str


def _summarize_heart_rate(
    stats: dict[str, Any],
    per_day_avg: dict[str, list[float]],
    resting_values: list[float],
) -> None:
    flat = [v for vals in per_day_avg.values() for v in vals]
    if flat:
        stats["heart_rate"]["avg"] = _safe_round(statistics.fmean(flat))
        stats["heart_rate"]["min"] = _safe_round(min(flat))
        stats["heart_rate"]["max"] = _safe_round(max(flat))
    if resting_values:
        stats["heart_rate"]["resting_avg"] = _safe_round(
            statistics.fmean(resting_values)
        )

    daily = []
    for day in sorted(per_day_avg.keys()):
        vals = per_day_avg[day]
        if not vals:
            continue
        daily.append(
            {
                "date": day,
                "avg": _safe_round(statistics.fmean(vals)),
                "min": _safe_round(min(vals)),
                "max": _safe_round(max(vals)),
            }
        )
    stats["heart_rate"]["daily_readings"] = daily


def _summarize_steps(stats: dict[str, Any], per_day: dict[str, float]) -> None:
    if not per_day:
        return
    totals = list(per_day.values())
    stats["steps"]["total"] = int(sum(totals))
    stats["steps"]["daily_avg"] = _safe_round(statistics.fmean(totals), 0)
    stats["steps"]["days_above_8000"] = sum(1 for v in totals if v >= 8000)


def _summarize_sleep(stats: dict[str, Any], per_night_hours: list[float]) -> None:
    if not per_night_hours:
        return
    stats["sleep"]["avg_hours"] = _safe_round(statistics.fmean(per_night_hours))
    stats["sleep"]["nights_below_6"] = sum(1 for h in per_night_hours if h < 6)


def _summarize_spo2(stats: dict[str, Any], values: list[float]) -> None:
    if not values:
        return
    stats["spo2"]["avg"] = _safe_round(statistics.fmean(values))
    stats["spo2"]["min"] = _safe_round(min(values))


# ── Format detection ─────────────────────────────────────────────────────


def detect_wearable_format(filename: str, file_bytes: bytes) -> str:
    """Best-effort source detection. The router falls back on this when the
    user does not pick a source explicitly. Sniffs the leading bytes so we
    don't have to fully parse the file just to know what it is."""
    name = (filename or "").lower()

    # Apple Health export: large XML, root element is HealthData.
    if name.endswith(".xml"):
        head = file_bytes[:4096].decode("utf-8", errors="replace")
        if "<HealthData" in head:
            return "apple_health"
        return "apple_health" if "HealthData" in head else "unknown"

    # ZIP archive — could be Fitbit, Google Takeout, or Apple's bundle.
    if name.endswith(".zip") or file_bytes[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                names = [n.lower() for n in zf.namelist()[:200]]
                joined = "\n".join(names)
                if "fitbit" in joined or "user-site-export" in joined:
                    return "fitbit"
                if "fit/" in joined or "takeout" in joined or "google" in joined:
                    return "google_fit"
                if any(n.endswith("export.xml") for n in names):
                    return "apple_health"
        except zipfile.BadZipFile:
            return "unknown"

    if name.endswith(".json"):
        try:
            text = file_bytes[:8192].decode("utf-8", errors="replace")
            head = text.lstrip()
            if head.startswith("[") or head.startswith("{"):
                lower = head.lower()
                # Google Fit / Takeout markers (very specific).
                if (
                    "datatypename" in lower
                    or "fitvalue" in lower
                    or "com.google.heart_rate" in lower
                    or "data source" in lower and "data points" in lower
                ):
                    return "google_fit"
                # Fitbit markers — explicit, and the common bare-metric shape
                # (`[{"dateTime": ..., "value": ...}]`).
                if "activities-heart" in lower or "fitbit" in lower:
                    return "fitbit"
                if '"datetime"' in lower and '"value"' in lower:
                    return "fitbit"
                # Filename hint: Fitbit's per-metric files follow patterns
                # like `heart_rate-2025-04-12.json`, `steps-...json`, etc.
                fitbit_hints = (
                    "heart_rate",
                    "resting_heart_rate",
                    "steps",
                    "sleep",
                    "spo2",
                    "weight",
                    "glucose",
                )
                if any(h in name for h in fitbit_hints):
                    return "fitbit"
        except Exception:
            return "unknown"

    return "unknown"


# ── Apple Health XML parser ──────────────────────────────────────────────


# HealthKit type identifiers we care about.
_AH_HEART_RATE = "HKQuantityTypeIdentifierHeartRate"
_AH_RESTING_HR = "HKQuantityTypeIdentifierRestingHeartRate"
_AH_SPO2 = "HKQuantityTypeIdentifierOxygenSaturation"
_AH_STEPS = "HKQuantityTypeIdentifierStepCount"
_AH_SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
_AH_WEIGHT = "HKQuantityTypeIdentifierBodyMass"
_AH_GLUCOSE = "HKQuantityTypeIdentifierBloodGlucose"


def parse_apple_health_xml(file_bytes: bytes) -> dict[str, Any]:
    """Stream-parse Apple Health export.xml (or the same XML inside a zip).

    iterparse releases element memory after each `</Record>` so even a 200MB
    export won't blow up the heap. The same routine is used by the ZIP path
    when the bundle contains an `export.xml`.
    """
    stats = _empty_stats("apple_health")

    # If they uploaded the whole .zip bundle, pull export.xml out of it first.
    payload: bytes = file_bytes
    if file_bytes[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                target = next(
                    (
                        n
                        for n in zf.namelist()
                        if n.lower().endswith("export.xml")
                    ),
                    None,
                )
                if target is None:
                    stats["errors"].append(
                        "Apple Health zip didn't contain export.xml."
                    )
                    return stats
                payload = zf.read(target)
        except zipfile.BadZipFile as exc:
            stats["errors"].append(f"Apple Health zip is corrupt: {exc}")
            return stats

    hr_per_day_avg: dict[str, list[float]] = defaultdict(list)
    resting_hr_values: list[float] = []
    spo2_values: list[float] = []
    steps_per_day: dict[str, float] = defaultdict(float)
    sleep_hours_per_night: list[float] = []
    weights: list[tuple[str, float]] = []  # (date, kg)
    glucose_readings: list[dict[str, Any]] = []

    try:
        # iterparse handles in-memory bytes via a BytesIO wrapper.
        for event, elem in ET.iterparse(io.BytesIO(payload), events=("end",)):
            if elem.tag != "Record":
                continue

            stats["raw_record_count"] += 1
            type_id = elem.get("type", "")
            value_str = elem.get("value", "")
            unit = (elem.get("unit") or "").lower()
            start_date = _date_only(elem.get("startDate"))
            _update_range(stats, start_date)

            try:
                value = float(value_str) if value_str else None
            except ValueError:
                value = None

            if type_id == _AH_HEART_RATE and value is not None and start_date:
                hr_per_day_avg[start_date].append(value)
            elif type_id == _AH_RESTING_HR and value is not None:
                resting_hr_values.append(value)
            elif type_id == _AH_SPO2 and value is not None:
                # Apple stores fractions (0–1) most of the time; convert.
                pct = value * 100 if value <= 1.5 else value
                spo2_values.append(pct)
                if pct < 94 and start_date:
                    stats["spo2"]["readings_below_94"].append(
                        {"date": start_date, "value": _safe_round(pct, 1)}
                    )
            elif type_id == _AH_STEPS and value is not None and start_date:
                steps_per_day[start_date] += value
            elif type_id == _AH_SLEEP:
                start = _parse_iso(elem.get("startDate"))
                end = _parse_iso(elem.get("endDate"))
                value_lc = (elem.get("value") or "").lower()
                # Apple emits multiple sleep states — only count "asleep" rows
                # (the ones whose value contains "asleep") so the night total
                # isn't doubled by InBed wrappers.
                if start and end and "asleep" in value_lc:
                    hours = (end - start).total_seconds() / 3600.0
                    if 0 < hours < 24:
                        sleep_hours_per_night.append(hours)
            elif type_id == _AH_WEIGHT and value is not None and start_date:
                kg = value
                if "lb" in unit or "pound" in unit:
                    kg = value * 0.45359237
                weights.append((start_date, kg))
            elif type_id == _AH_GLUCOSE and value is not None and start_date:
                glucose_readings.append({"date": start_date, "value": value})

            elem.clear()  # Release element memory immediately.
    except ET.ParseError as exc:
        stats["errors"].append(
            f"XML stopped parsing partway through: {exc}. "
            "Returning partial results."
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Apple Health parse failed")
        stats["errors"].append(f"Unexpected error parsing export: {exc}")

    _summarize_heart_rate(stats, hr_per_day_avg, resting_hr_values)
    _summarize_spo2(stats, spo2_values)
    _summarize_steps(stats, steps_per_day)
    _summarize_sleep(stats, sleep_hours_per_night)

    if weights:
        weights.sort()
        latest_kg = weights[-1][1]
        first_kg = weights[0][1]
        stats["weight"]["latest_kg"] = _safe_round(latest_kg)
        stats["weight"]["change_kg"] = _safe_round(latest_kg - first_kg)

    stats["blood_glucose"]["readings"] = sorted(
        glucose_readings, key=lambda r: r["date"]
    )

    return stats


# ── Fitbit JSON parser ───────────────────────────────────────────────────


def _iter_zip_jsons(file_bytes: bytes) -> list[tuple[str, Any]]:
    """Yield (filename, parsed-JSON) pairs from a ZIP. Skip non-JSON files."""
    out: list[tuple[str, Any]] = []
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            for name in zf.namelist():
                if not name.lower().endswith(".json"):
                    continue
                try:
                    data = json.loads(zf.read(name))
                except json.JSONDecodeError:
                    continue
                except Exception:
                    continue
                out.append((name, data))
    except zipfile.BadZipFile:
        pass
    return out


def parse_fitbit_json(
    file_bytes: bytes, filename: str | None = None
) -> dict[str, Any]:
    """Parse a Fitbit Takeout export — a ZIP of per-metric JSON files, or
    a single JSON file with one of the known shapes.

    The Fitbit export stores each metric type in its own folder, e.g.:
        Physical Activity/heart_rate-2025-04-12.json
        Physical Activity/steps-2025-04-12.json
        Sleep/sleep-2025-04-12.json

    Each file is a list of records with `dateTime` + `value` (or a nested
    `value` object). We accumulate by metric and reuse the same summary
    helpers as the Apple parser.

    `filename` lets the caller pass the original upload filename so the
    metric routing keys off "heart_rate-..." / "steps-..." even when the
    request body is a single bare JSON file.
    """
    stats = _empty_stats("fitbit")

    payloads: list[tuple[str, Any]] = []
    if file_bytes[:4] == b"PK\x03\x04":
        payloads = _iter_zip_jsons(file_bytes)
        if not payloads:
            stats["errors"].append("Fitbit zip didn't contain any JSON files.")
            return stats
    else:
        try:
            payloads = [(filename or "upload.json", json.loads(file_bytes))]
        except json.JSONDecodeError as exc:
            stats["errors"].append(f"Fitbit JSON failed to parse: {exc}")
            return stats

    hr_per_day_avg: dict[str, list[float]] = defaultdict(list)
    resting_hr_values: list[float] = []
    spo2_values: list[float] = []
    steps_per_day: dict[str, float] = defaultdict(float)
    sleep_hours_per_night: list[float] = []
    weights: list[tuple[str, float]] = []
    glucose_readings: list[dict[str, Any]] = []

    for name, data in payloads:
        lower = name.lower()
        records = data if isinstance(data, list) else [data]

        if "heart_rate" in lower or "heartrate" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("dateTime") or rec.get("date"))
                _update_range(stats, date)
                value = rec.get("value")
                # Two common shapes: scalar bpm, or {"bpm": .., "confidence": ..}
                if isinstance(value, dict):
                    bpm = value.get("bpm") or value.get("restingHeartRate")
                else:
                    bpm = value
                if isinstance(bpm, (int, float)) and date:
                    hr_per_day_avg[date].append(float(bpm))
                if isinstance(value, dict) and value.get("restingHeartRate"):
                    resting_hr_values.append(float(value["restingHeartRate"]))

        elif "resting_heart" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                v = rec.get("value")
                if isinstance(v, (int, float)):
                    resting_hr_values.append(float(v))

        elif "spo2" in lower or "oxygen" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("dateTime") or rec.get("date"))
                _update_range(stats, date)
                v = rec.get("value")
                if isinstance(v, dict):
                    v = v.get("avg") or v.get("value")
                if isinstance(v, (int, float)):
                    pct = float(v)
                    if pct <= 1.5:
                        pct *= 100
                    spo2_values.append(pct)
                    if pct < 94 and date:
                        stats["spo2"]["readings_below_94"].append(
                            {"date": date, "value": _safe_round(pct, 1)}
                        )

        elif "steps" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("dateTime") or rec.get("date"))
                _update_range(stats, date)
                v = rec.get("value")
                if isinstance(v, str):
                    try:
                        v = float(v)
                    except ValueError:
                        v = None
                if isinstance(v, (int, float)) and date:
                    steps_per_day[date] += float(v)

        elif "sleep" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("dateOfSleep") or rec.get("dateTime"))
                _update_range(stats, date)
                # Fitbit gives durations in milliseconds.
                duration_ms = rec.get("duration") or rec.get("minutesAsleep")
                if isinstance(duration_ms, (int, float)):
                    if duration_ms > 24 * 60 * 60 * 1000:
                        # Implausible; skip.
                        continue
                    if "minutesAsleep" in rec:
                        hours = float(duration_ms) / 60.0
                    else:
                        hours = float(duration_ms) / (1000 * 60 * 60)
                    if 0 < hours < 24:
                        sleep_hours_per_night.append(hours)

        elif "weight" in lower or "body" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("date") or rec.get("dateTime"))
                kg = rec.get("weight")
                if kg is None:
                    val = rec.get("value")
                    if isinstance(val, dict):
                        kg = val.get("weight")
                    elif isinstance(val, (int, float)):
                        kg = val
                if isinstance(kg, (int, float)) and date:
                    weights.append((date, float(kg)))

        elif "glucose" in lower:
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                stats["raw_record_count"] += 1
                date = _date_only(rec.get("dateTime") or rec.get("date"))
                v = rec.get("value")
                if isinstance(v, dict):
                    v = v.get("value")
                if isinstance(v, (int, float)) and date:
                    glucose_readings.append({"date": date, "value": float(v)})

    _summarize_heart_rate(stats, hr_per_day_avg, resting_hr_values)
    _summarize_spo2(stats, spo2_values)
    _summarize_steps(stats, steps_per_day)
    _summarize_sleep(stats, sleep_hours_per_night)

    if weights:
        weights.sort()
        latest_kg = weights[-1][1]
        first_kg = weights[0][1]
        stats["weight"]["latest_kg"] = _safe_round(latest_kg)
        stats["weight"]["change_kg"] = _safe_round(latest_kg - first_kg)

    stats["blood_glucose"]["readings"] = sorted(
        glucose_readings, key=lambda r: r["date"]
    )

    return stats


# ── Google Fit JSON parser ───────────────────────────────────────────────


def parse_google_fit_json(file_bytes: bytes) -> dict[str, Any]:
    """Parse Google Takeout fitness data (single JSON or ZIP).

    Google Takeout layout:
        Takeout/Fit/Daily activity metrics/2025-04-12.csv
        Takeout/Fit/All Sessions/...json
        Takeout/Fit/All Data/derived_com.google.heart_rate.bpm_*.json

    Each "All Data" JSON is `{"Data Source": "...", "Data Points": [...]}`.
    Data points have `fitValue` arrays, `startTimeNanos`, `endTimeNanos`.
    """
    stats = _empty_stats("google_fit")

    payloads: list[tuple[str, Any]] = []
    if file_bytes[:4] == b"PK\x03\x04":
        payloads = _iter_zip_jsons(file_bytes)
        if not payloads:
            stats["errors"].append(
                "Google Takeout zip didn't contain any JSON files."
            )
            return stats
    else:
        try:
            payloads = [("upload.json", json.loads(file_bytes))]
        except json.JSONDecodeError as exc:
            stats["errors"].append(f"Google Fit JSON failed to parse: {exc}")
            return stats

    hr_per_day_avg: dict[str, list[float]] = defaultdict(list)
    resting_hr_values: list[float] = []
    spo2_values: list[float] = []
    steps_per_day: dict[str, float] = defaultdict(float)
    sleep_hours_per_night: list[float] = []
    weights: list[tuple[str, float]] = []
    glucose_readings: list[dict[str, Any]] = []

    def _ns_to_date(ns: Any) -> Optional[str]:
        try:
            seconds = int(ns) / 1_000_000_000
            return datetime.utcfromtimestamp(seconds).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError):
            return None

    def _fit_value_first_number(point: dict) -> Optional[float]:
        for v in (point.get("fitValue") or []):
            if not isinstance(v, dict):
                continue
            value = v.get("value")
            if isinstance(value, dict):
                for k in ("fpVal", "intVal"):
                    if k in value and isinstance(value[k], (int, float)):
                        return float(value[k])
            elif isinstance(value, (int, float)):
                return float(value)
        return None

    for name, data in payloads:
        if not isinstance(data, dict):
            continue
        source = (data.get("Data Source") or "").lower()
        points = data.get("Data Points") or []
        if not points:
            continue

        # Heart rate (bpm)
        if "heart_rate.bpm" in source:
            for p in points:
                stats["raw_record_count"] += 1
                date = _ns_to_date(p.get("startTimeNanos"))
                _update_range(stats, date)
                bpm = _fit_value_first_number(p)
                if bpm is not None and date:
                    hr_per_day_avg[date].append(bpm)

        elif "resting_heart_rate" in source:
            for p in points:
                stats["raw_record_count"] += 1
                bpm = _fit_value_first_number(p)
                if bpm is not None:
                    resting_hr_values.append(bpm)

        elif "oxygen_saturation" in source or "spo2" in source:
            for p in points:
                stats["raw_record_count"] += 1
                date = _ns_to_date(p.get("startTimeNanos"))
                _update_range(stats, date)
                v = _fit_value_first_number(p)
                if v is not None:
                    pct = v * 100 if v <= 1.5 else v
                    spo2_values.append(pct)
                    if pct < 94 and date:
                        stats["spo2"]["readings_below_94"].append(
                            {"date": date, "value": _safe_round(pct, 1)}
                        )

        elif "step_count" in source or "step_count.delta" in source:
            for p in points:
                stats["raw_record_count"] += 1
                date = _ns_to_date(p.get("startTimeNanos"))
                _update_range(stats, date)
                v = _fit_value_first_number(p)
                if v is not None and date:
                    steps_per_day[date] += v

        elif "sleep" in source or "sleep.segment" in source:
            for p in points:
                stats["raw_record_count"] += 1
                start_ns = p.get("startTimeNanos")
                end_ns = p.get("endTimeNanos")
                date = _ns_to_date(start_ns)
                _update_range(stats, date)
                try:
                    hours = (
                        (int(end_ns) - int(start_ns)) / 1_000_000_000 / 3600.0
                    )
                except (TypeError, ValueError):
                    continue
                if 0 < hours < 24:
                    sleep_hours_per_night.append(hours)

        elif "weight" in source:
            for p in points:
                stats["raw_record_count"] += 1
                date = _ns_to_date(p.get("startTimeNanos"))
                kg = _fit_value_first_number(p)
                if kg is not None and date:
                    weights.append((date, kg))

        elif "blood_glucose" in source:
            for p in points:
                stats["raw_record_count"] += 1
                date = _ns_to_date(p.get("startTimeNanos"))
                v = _fit_value_first_number(p)
                if v is not None and date:
                    glucose_readings.append({"date": date, "value": v})

    _summarize_heart_rate(stats, hr_per_day_avg, resting_hr_values)
    _summarize_spo2(stats, spo2_values)
    _summarize_steps(stats, steps_per_day)
    _summarize_sleep(stats, sleep_hours_per_night)

    if weights:
        weights.sort()
        latest_kg = weights[-1][1]
        first_kg = weights[0][1]
        stats["weight"]["latest_kg"] = _safe_round(latest_kg)
        stats["weight"]["change_kg"] = _safe_round(latest_kg - first_kg)

    stats["blood_glucose"]["readings"] = sorted(
        glucose_readings, key=lambda r: r["date"]
    )

    return stats


# ── Dispatch ────────────────────────────────────────────────────────────


def parse_wearable_export(filename: str, file_bytes: bytes) -> dict[str, Any]:
    """High-level entry point used by the router. Picks a parser via
    detect_wearable_format and tags the source on the result so the caller
    doesn't have to dispatch a second time."""
    fmt = detect_wearable_format(filename, file_bytes)
    if fmt == "apple_health":
        return parse_apple_health_xml(file_bytes)
    if fmt == "fitbit":
        return parse_fitbit_json(file_bytes, filename=filename)
    if fmt == "google_fit":
        return parse_google_fit_json(file_bytes)
    out = _empty_stats("unknown")
    out["errors"].append(
        "Unsupported file format. Please upload Apple Health export.zip / "
        "export.xml, a Fitbit data export ZIP/JSON, or a Google Takeout "
        "Fit JSON/ZIP."
    )
    return out


def stats_for_prompt(stats: dict[str, Any]) -> str:
    """Render the standardized stats dict as compact human-readable lines
    for the LLM. Anything missing is just omitted (no None placeholders)."""
    lines: list[str] = [
        f"Source: {stats['source']}",
    ]
    rng = stats["date_range"]
    if rng.get("start") or rng.get("end"):
        lines.append(
            f"Date range: {rng.get('start') or '?'} → {rng.get('end') or '?'}"
        )
    lines.append(f"Records parsed: {stats['raw_record_count']}")

    hr = stats["heart_rate"]
    if hr["avg"] is not None:
        lines.append(
            f"Heart rate — avg {hr['avg']} bpm, min {hr['min']}, max {hr['max']}, "
            f"resting avg {hr['resting_avg'] if hr['resting_avg'] is not None else 'n/a'}, "
            f"daily readings: {len(hr['daily_readings'])}"
        )

    spo2 = stats["spo2"]
    if spo2["avg"] is not None:
        below = len(spo2["readings_below_94"])
        lines.append(
            f"SpO2 — avg {spo2['avg']}%, min {spo2['min']}%, "
            f"readings below 94%: {below}"
        )

    steps = stats["steps"]
    if steps["daily_avg"] is not None:
        lines.append(
            f"Steps — daily avg {steps['daily_avg']}, total "
            f"{steps['total']}, days ≥8000: {steps['days_above_8000']}"
        )

    sleep = stats["sleep"]
    if sleep["avg_hours"] is not None:
        lines.append(
            f"Sleep — avg {sleep['avg_hours']} hours/night, "
            f"nights below 6h: {sleep['nights_below_6']}"
        )

    weight = stats["weight"]
    if weight["latest_kg"] is not None:
        change = weight["change_kg"]
        change_text = f"{change:+} kg" if change is not None else "no trend"
        lines.append(f"Weight — latest {weight['latest_kg']} kg ({change_text})")

    glucose = stats["blood_glucose"]["readings"]
    if glucose:
        nums = [g["value"] for g in glucose if isinstance(g.get("value"), (int, float))]
        if nums:
            lines.append(
                f"Blood glucose — {len(glucose)} readings, "
                f"avg {round(statistics.fmean(nums), 1)}, "
                f"min {round(min(nums), 1)}, max {round(max(nums), 1)}"
            )

    if stats.get("errors"):
        lines.append("Parser warnings:")
        for err in stats["errors"][:3]:
            lines.append(f"  - {err}")

    return "\n".join(lines)
