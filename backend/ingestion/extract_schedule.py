"""
Pulls WNBA games from ESPN's public scoreboard endpoint and inserts them into
the Game table, joined against the already-seeded Team and Network rows.

Run from the backend/ folder: python -m ingestion.extract_schedule
(the -m form is needed so the 'app' package import below resolves correctly)
"""

import requests
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import Team, Network, Game

BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard"


def get_games_for_date(date_str: str) -> list[dict]:
    """
    date_str must be in YYYYMMDD format.
    Returns raw parsed game dicts for that date (empty list if no games).
    """
    resp = requests.get(BASE_URL, params={"dates": date_str})
    resp.raise_for_status()
    data = resp.json()

    games = []
    for event in data.get("events", []):
        competition = event["competitions"][0]

        competitors = competition["competitors"]
        home = next(c for c in competitors if c["homeAway"] == "home")
        away = next(c for c in competitors if c["homeAway"] == "away")

        broadcasts = competition.get("broadcasts", [])
        network_name = broadcasts[0]["names"][0] if broadcasts and broadcasts[0].get("names") else None

        games.append({
            "espn_event_id": event["id"],
            "game_datetime": datetime.strptime(event["date"], "%Y-%m-%dT%H:%MZ"),
            "home_team_name": home["team"]["displayName"],
            "away_team_name": away["team"]["displayName"],
            "network_name": network_name,
        })

    return games


def get_or_create_local_broadcast(db) -> Network:
    """
    Catch-all Network row for regional/local affiliates we don't individually
    track (e.g. team-specific local cable deals). Created once, reused after.
    """
    network = db.query(Network).filter_by(name="Local Broadcast").first()
    if not network:
        network = Network(name="Local Broadcast")
        db.add(network)
        db.flush()  # assigns network.id without needing a full commit yet
    return network


def insert_games(games: list[dict], db) -> tuple[int, int, list[str]]:
    """
    Inserts games into the DB, looking up existing Team/Network rows by name.
    Returns (inserted_count, skipped_count, warnings) instead of printing directly,
    so this function stays testable and reusable.
    """
    inserted = 0
    skipped = 0
    warnings = []

    for g in games:
        # Skip if this exact ESPN game was already inserted (idempotent, like the seed script)
        exists = db.query(Game).filter_by(espn_event_id=g["espn_event_id"]).first()
        if exists:
            skipped += 1
            continue

        home_team = db.query(Team).filter_by(name=g["home_team_name"]).first()
        away_team = db.query(Team).filter_by(name=g["away_team_name"]).first()

        if not home_team or not away_team:
            warnings.append(
                f"Skipped {g['away_team_name']} vs {g['home_team_name']}: "
                f"team name not found in seeded Teams table (name mismatch?)"
            )
            continue

        network = None
        if g["network_name"]:
            network = db.query(Network).filter_by(name=g["network_name"]).first()
            if not network:
                # Unrecognized network (usually a regional/local affiliate like
                # "KPIX+" or "CW26") — fall back to a generic catch-all instead
                # of leaving network_id blank, so the app can still show
                # something meaningful ("Check local listings") for this game.
                network = get_or_create_local_broadcast(db)
                warnings.append(
                    f"Network '{g['network_name']}' not recognized — "
                    f"tagged as 'Local Broadcast' instead"
                )

        db.add(Game(
            espn_event_id=g["espn_event_id"],
            game_datetime=g["game_datetime"],
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            network_id=network.id if network else None,
        ))
        inserted += 1

    db.commit()
    return inserted, skipped, warnings


def run(start_date: str, end_date: str):
    start = datetime.strptime(start_date, "%Y%m%d")
    end = datetime.strptime(end_date, "%Y%m%d")

    all_games = []
    current = start
    while current <= end:
        all_games.extend(get_games_for_date(current.strftime("%Y%m%d")))
        current += timedelta(days=1)

    db = SessionLocal()
    try:
        inserted, skipped, warnings = insert_games(all_games, db)
    finally:
        db.close()

    print(f"Inserted: {inserted}, Skipped (already existed): {skipped}")
    for w in warnings:
        print(f"  WARNING: {w}")


if __name__ == "__main__":
    # Placeholder range — swap for real season dates
    run("20260424", "20261001")