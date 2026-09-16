"""
One-time seed script: populates teams, networks, and services (plus the
network-to-service mapping) so the database has real reference data to
join against once games start getting inserted.

Run from the backend/ folder: python seed_data.py
Safe to re-run: it checks for existing rows before inserting duplicates.
"""

import json
import os
from collections import defaultdict

from app.database import SessionLocal, engine
from app.models import Base, Team, Network, Service, TeamMarketZip

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _load_json(filename):
    with open(os.path.join(DATA_DIR, filename), encoding="utf-8") as f:
        return json.load(f)

# ESPN's team abbreviations, used to build logo URLs
# (https://a.espncdn.com/i/teamlogos/wnba/500/{abbreviation}.png)
# NOTE: PHX, POR, SEA, TOR, WSH are inferred from standard ESPN convention,
# not directly confirmed - double check these five if a logo doesn't load.
TEAM_ABBREVIATIONS = {
    "Atlanta Dream": "ATL",
    "Chicago Sky": "CHI",
    "Connecticut Sun": "CON",
    "Dallas Wings": "DAL",
    "Golden State Valkyries": "GS",
    "Indiana Fever": "IND",
    "Las Vegas Aces": "LV",
    "Los Angeles Sparks": "LA",
    "Minnesota Lynx": "MIN",
    "New York Liberty": "NY",
    "Phoenix Mercury": "PHX",
    "Portland Fire": "POR",
    "Seattle Storm": "SEA",
    "Toronto Tempo": "TOR",
    "Washington Mystics": "WSH",
}

TEAMS = list(TEAM_ABBREVIATIONS.keys())

# Networks that carry WNBA games (national broadcast partners)
NETWORKS = [
    "ESPN", "ABC", "ION", "NBC", "Prime Video", "NBA TV", "CBS",
    "Peacock", "WNBA League Pass", "USA Net",
]

# Streaming services + their pricing/metadata, reconciled from the hand-curated
# data/services.json (copied from the project's original data layer) instead of
# being invented inline. See data/service_networks.json for which service
# carries which network - that replaces the old hand-typed NETWORK_TO_SERVICES
# below it too.
_CURATED_SERVICES = {s["id"]: s for s in _load_json("services.json")["services"]}

# A few real, already-in-use services aren't in services.json yet (it was
# written before this app had ingested any games). Kept here with clearly
# flagged estimated pricing rather than silently dropping the coverage they
# already provided - verify before launch, same caveat services.json itself
# carries.
_SUPPLEMENTAL_SERVICES = {
    "hulu_live": {
        "name": "Hulu+ Live TV", "monthly_price": 82.99, "annual_price": None,
        "one_time_price": None, "type": "live_tv",
        "special_rules": "ESTIMATED - not yet in data/services.json, verify before launch.",
        "url": "https://www.hulu.com/live-tv",
    },
    "sling_tv": {
        "name": "Sling TV", "monthly_price": 45.99, "annual_price": None,
        "one_time_price": None, "type": "live_tv",
        "special_rules": "ESTIMATED - not yet in data/services.json, verify before launch.",
        "url": "https://www.sling.com",
    },
    "nba_league_pass": {
        "name": "NBA League Pass", "monthly_price": 14.99, "annual_price": None,
        "one_time_price": None, "type": "league_dtc",
        "special_rules": "ESTIMATED - not yet in data/services.json, verify before launch.",
        "url": "https://www.nba.com/leaguepass",
    },
}

# Lookup keyed by display NAME (not id) since that's what the rest of the app
# - Game/Network relationships, coverage.py - actually works with.
SERVICE_INFO_BY_NAME = {
    info["name"]: {
        "monthly_price": info.get("monthly_price"),
        "annual_price": info.get("annual_price"),
        "one_time_price": info.get("one_time_price"),
        "service_type": info.get("type"),
        "special_rules": info.get("special_rules"),
        "url": info.get("url"),
    }
    for info in {**_CURATED_SERVICES, **_SUPPLEMENTAL_SERVICES}.values()
}

SERVICES = list(SERVICE_INFO_BY_NAME.keys())

# Older hand-typed service names this reconciliation replaces, mapped to their
# new curated-data name, so we RENAME the existing DB rows instead of leaving
# stale duplicates sitting alongside the new ones.
LEGACY_SERVICE_RENAMES = {
    "ESPN App": "ESPN Unlimited (DTC)",
    "Prime Video App": "Amazon Prime Video",
    "Peacock": "Peacock Premium",
    "Fubo": "Fubo Pro",
}
# Dead entry from the old hand-typed list - never actually mapped to a
# network, fully superseded by "ESPN Unlimited (DTC)" above.
LEGACY_SERVICE_REMOVALS = ["ESPN+"]

# data/service_networks.json uses network/service IDS, not the display names
# already seeded into our Network table - this bridges the two.
_NETWORK_ID_TO_NAME = {
    "abc": "ABC",
    "espn": "ESPN",
    "ion": "ION",
    "usa": "USA Net",
    "cbs": "CBS",
    "prime": "Prime Video",
    "nbc": "NBC",
    "peacock_ex": "Peacock",  # curated file's "Peacock/NBCSN"-exclusive network
                              # folds into the one "Peacock" Network row we seed
    "nbatv": "NBA TV",
    "local": "Local Broadcast",  # coverage.py matches on this exact string - never rename
}

# Which streaming services carry which network, built from the curated
# junction table instead of a hand-typed guess.
NETWORK_TO_SERVICES = defaultdict(list)
for _row in _load_json("service_networks.json")["service_networks"]:
    _network_name = _NETWORK_ID_TO_NAME.get(_row["network_id"])
    _service_info = _CURATED_SERVICES.get(_row["service_id"])
    if not _network_name or not _service_info:
        continue
    if _service_info["name"] not in NETWORK_TO_SERVICES[_network_name]:
        NETWORK_TO_SERVICES[_network_name].append(_service_info["name"])

# The 3 supplemental services above aren't in service_networks.json either -
# keep their existing hand-typed carriage so we don't lose that coverage.
# Also: the curated junction file's "league_pass" -> "local" row only models
# the local-market-blackout case (this app's "Local Broadcast" network). It
# has no concept of THIS app's separate "WNBA League Pass" network, used for
# games nationally distributed via the league's own app - that self-link has
# to be kept by hand or those games silently drop out of coverage entirely.
_SUPPLEMENTAL_NETWORK_TO_SERVICES = {
    "ESPN": ["Hulu+ Live TV", "Sling TV"],
    "ABC": ["Hulu+ Live TV"],
    "NBC": ["Hulu+ Live TV"],
    "CBS": ["Hulu+ Live TV"],
    "USA Net": ["Hulu+ Live TV", "Sling TV"],
    "NBA TV": ["NBA League Pass", "Sling TV"],
    "WNBA League Pass": ["WNBA League Pass"],
}
for _network_name, _service_names in _SUPPLEMENTAL_NETWORK_TO_SERVICES.items():
    for _service_name in _service_names:
        if _service_name not in NETWORK_TO_SERVICES[_network_name]:
            NETWORK_TO_SERVICES[_network_name].append(_service_name)

NETWORK_TO_SERVICES = dict(NETWORK_TO_SERVICES)

# Approximate home-market zip prefixes per team, based on their metro area.
# NOTE: this is a simplification (3-digit zip prefix), not precise Nielsen DMA
# data — good enough to answer "is this user in-market," which is all the
# blackout logic needs. Worth refining later if you want higher accuracy.
TEAM_MARKET_ZIPS = {
    "Atlanta Dream": ["300", "301", "302", "303", "311", "312"],
    "Chicago Sky": ["606", "607", "608", "600", "601"],
    "Connecticut Sun": ["063", "064", "060", "061", "062"],
    "Dallas Wings": ["750", "751", "752", "753", "760"],
    "Golden State Valkyries": ["941", "940", "944", "945", "946", "947"],
    "Indiana Fever": ["462", "463", "460", "461"],
    "Las Vegas Aces": ["891", "889", "890"],
    "Los Angeles Sparks": ["900", "901", "902", "903", "904", "905"],
    "Minnesota Lynx": ["554", "553", "550", "551", "552"],
    "New York Liberty": ["100", "101", "102", "103", "104", "112", "113"],
    "Phoenix Mercury": ["850", "851", "852", "853"],
    "Portland Fire": ["972", "970", "971", "973", "974"],
    "Seattle Storm": ["980", "981", "982", "983"],
    "Toronto Tempo": ["M"],  # Canadian postal code letter prefix, not a US zip3
    "Washington Mystics": ["200", "202", "203", "204", "205"],
}


def _ensure_service_price_columns():
    """
    Base.metadata.create_all() only creates tables that don't exist yet - it
    won't add new columns to a `services` table that was already sitting in
    wnba.db from before this pricing data existed. Adds them in-place if
    missing; a harmless no-op once they're there.

    SQLite-only: this whole patch exists because an old SQLite file might
    predate these columns. A fresh Postgres database has no such history -
    create_all() already creates `services` with every current model column
    from scratch - and "PRAGMA table_info" below is SQLite-specific syntax
    that would just error out against Postgres, so skip entirely there.
    """
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        existing_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(services)")}
        new_columns = {
            "monthly_price": "FLOAT",
            "annual_price": "FLOAT",
            "one_time_price": "FLOAT",
            "service_type": "VARCHAR",
            "special_rules": "VARCHAR",
            "url": "VARCHAR",
        }
        for col_name, col_type in new_columns.items():
            if col_name not in existing_cols:
                conn.exec_driver_sql(f"ALTER TABLE services ADD COLUMN {col_name} {col_type}")
        conn.commit()


def seed():
    Base.metadata.create_all(bind=engine)  # safe if tables already exist
    _ensure_service_price_columns()
    db = SessionLocal()

    try:
        # --- Teams ---
        for name in TEAMS:
            existing = db.query(Team).filter_by(name=name).first()
            if not existing:
                db.add(Team(name=name, abbreviation=TEAM_ABBREVIATIONS.get(name)))
            elif not existing.abbreviation:
                # Backfill abbreviation for teams seeded before this field existed
                existing.abbreviation = TEAM_ABBREVIATIONS.get(name)
        db.commit()
        print(f"Teams seeded: {db.query(Team).count()} total in DB")

        # --- Networks ---
        for name in NETWORKS:
            exists = db.query(Network).filter_by(name=name).first()
            if not exists:
                db.add(Network(name=name))
        db.commit()
        print(f"Networks seeded: {db.query(Network).count()} total in DB")

        # --- Services (rename old hand-typed rows to their curated-data name first) ---
        for old_name, new_name in LEGACY_SERVICE_RENAMES.items():
            row = db.query(Service).filter_by(name=old_name).first()
            if row and not db.query(Service).filter_by(name=new_name).first():
                row.name = new_name
        for dead_name in LEGACY_SERVICE_REMOVALS:
            row = db.query(Service).filter_by(name=dead_name).first()
            if row:
                db.delete(row)
        db.commit()

        # --- Services (insert new ones, keep existing ones' pricing in sync) ---
        for name in SERVICES:
            info = SERVICE_INFO_BY_NAME[name]
            existing = db.query(Service).filter_by(name=name).first()
            if not existing:
                db.add(Service(name=name, **info))
            else:
                for field, value in info.items():
                    setattr(existing, field, value)
        db.commit()
        print(f"Services seeded: {db.query(Service).count()} total in DB")

        # --- Network <-> Service mapping ---
        # Cleared and rebuilt fresh each run: this mapping is now fully derived
        # from the curated data files rather than hand-maintained, so old
        # associations (e.g. Fubo used to be wrongly linked to NBC/USA Net
        # under the previous hand-typed mapping) need to actually go away,
        # not just have new ones appended on top.
        for network in db.query(Network).all():
            network.services = []
        db.commit()

        for network_name, service_names in NETWORK_TO_SERVICES.items():
            network = db.query(Network).filter_by(name=network_name).first()
            if not network:
                continue
            for service_name in service_names:
                service = db.query(Service).filter_by(name=service_name).first()
                if service and service not in network.services:
                    network.services.append(service)
        db.commit()
        print("Network-to-service mapping complete")

        # --- Team market zip prefixes ---
        added = 0
        for team_name, prefixes in TEAM_MARKET_ZIPS.items():
            team = db.query(Team).filter_by(name=team_name).first()
            if not team:
                continue
            for prefix in prefixes:
                exists = db.query(TeamMarketZip).filter_by(team_id=team.id, zip_prefix=prefix).first()
                if not exists:
                    db.add(TeamMarketZip(team_id=team.id, zip_prefix=prefix))
                    added += 1
        db.commit()
        print(f"Market zip prefixes seeded: {added} new rows added")

    finally:
        db.close()


if __name__ == "__main__":
    seed()