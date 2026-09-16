"""
Diagnostic: compares what's actually in the database for a team's games
against what you'd expect, to help spot data gaps or naming mismatches.

Run from backend/: python diagnose_team.py "Indiana Fever"
"""

import sys
from app.database import SessionLocal
from app.models import Team, Game, Network

def diagnose(team_name: str):
    db = SessionLocal()
    team = db.query(Team).filter_by(name=team_name).first()
    if not team:
        print(f"No team found named '{team_name}'")
        return

    games = (
        db.query(Game)
        .filter((Game.home_team_id == team.id) | (Game.away_team_id == team.id))
        .order_by(Game.game_datetime)
        .all()
    )

    print(f"Total games in DB for {team_name}: {len(games)}")
    if games:
        print(f"Date range in DB: {games[0].game_datetime.date()} to {games[-1].game_datetime.date()}")

    # Every distinct network name actually in your Networks table
    print("\nAll seeded network names:")
    for n in db.query(Network).all():
        print(f"  - {n.name}")

    # Every game currently tagged as Prime Video specifically
    print(f"\nGames tagged 'Prime Video' for {team_name}:")
    prime_games = [g for g in games if g.network and g.network.name == "Prime Video"]
    for g in prime_games:
        print(f"  {g.game_datetime.date()} | {g.away_team.name} vs {g.home_team.name}")
    print(f"Count: {len(prime_games)}")

    # Games with NO network matched at all (potential naming mismatches hiding here)
    print(f"\nGames with no network for {team_name} (check these for hidden Prime Video variants):")
    unlisted = [g for g in games if g.network is None]
    for g in unlisted:
        print(f"  {g.game_datetime.date()} | {g.away_team.name} vs {g.home_team.name}")
    print(f"Count: {len(unlisted)}")

    db.close()


if __name__ == "__main__":
    team_name = sys.argv[1] if len(sys.argv) > 1 else "Indiana Fever"
    diagnose(team_name)