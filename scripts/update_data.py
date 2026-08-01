#!/usr/bin/env python3
"""Met à jour les marées de Boucau-Bayonne et les heures solaires de Tarnos."""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://api-maree.fr"
SUN_API = "https://api.sunrisesunset.io/json"
TZ = "Europe/Paris"
LAT = 43.541
LNG = -1.462
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "tides.json"


def get_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Marees-Tarnos-GitHub-Action/2.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} pour {url}")
        return json.load(response)


def normalized(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in text if ch.isalnum())


def resolve_site_id(api_key: str) -> tuple[str, str]:
    # /sites est public selon la documentation. La clé est ajoutée pour rester compatible
    # avec une éventuelle évolution du service.
    url = f"{API_BASE}/sites?{urllib.parse.urlencode({'key': api_key})}"
    payload = get_json(url)
    sites = payload.get("sites", [])
    targets = ("boucau bayonne biarritz", "boucau bayonne", "bayonne biarritz")
    for target in targets:
        needle = normalized(target)
        for site in sites:
            name = normalized(str(site.get("site_name", "")))
            site_id = normalized(str(site.get("site_id", "")))
            if needle in name or name in needle or needle in site_id or site_id in needle:
                return str(site["site_id"]), str(site.get("site_name", "Boucau-Bayonne / Biarritz"))
    # Identifiant le plus probable, utilisé seulement si la liste change de structure.
    return "boucau-bayonne-biarritz", "Boucau-Bayonne / Biarritz"


def main() -> int:
    api_key = os.environ.get("API_MAREE_KEY", "").strip()
    if not api_key:
        print("La variable API_MAREE_KEY est absente.", file=sys.stderr)
        return 2

    today = dt.date.today()
    end = today + dt.timedelta(days=7)
    start_s = today.isoformat()
    end_s = end.isoformat()
    site_id, site_name = resolve_site_id(api_key)

    tide_query = urllib.parse.urlencode({
        "site": site_id,
        "from": start_s,
        "to": end_s,
        "tz": TZ,
        "key": api_key,
    })
    tides = get_json(f"{API_BASE}/tide-extrema?{tide_query}")

    sun_query = urllib.parse.urlencode({
        "lat": LAT,
        "lng": LNG,
        "date_start": start_s,
        "date_end": end_s,
        "timezone": TZ,
        "time_format": 24,
    })
    sun_payload = get_json(f"{SUN_API}?{sun_query}")
    sun_results = sun_payload.get("results", [])
    if isinstance(sun_results, dict):
        sun_results = [sun_results]
    sun_by_date = {item.get("date"): item for item in sun_results}

    days = []
    for item in tides.get("data", []):
        date = item.get("date")
        events = []
        for event in item.get("extrema", []):
            events.append({
                "type": "high" if event.get("type") == "PM" else "low",
                "time": event.get("time"),
                "height": round(float(event.get("height", 0)), 2),
                **({"coefficient": int(event["coef"])} if event.get("coef") is not None else {}),
            })
        sun = sun_by_date.get(date, {})
        days.append({
            "date": date,
            "events": events,
            "solar": {
                "dawn": sun.get("dawn"),
                "sunrise": sun.get("sunrise"),
                "sunset": sun.get("sunset"),
                "dusk": sun.get("dusk"),
            },
        })

    if not days:
        raise RuntimeError("L’API n’a renvoyé aucune journée de marée.")

    output = {
        "location": "Tarnos",
        "reference_port": site_name,
        "site_id": site_id,
        "timezone": TZ,
        "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "attribution": tides.get("attribution", "Données de marée fournies par api-maree.fr sous licence CC BY, calculées à partir de composantes harmoniques Ifremer / PREVIMER."),
        "days": days,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(days)} jours enregistrés pour {site_name} ({site_id}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
