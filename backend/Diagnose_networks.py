"""
Checks for duplicate Network rows (same name, different id) and verifies
that every network with games actually has its services linked correctly.

Run from backend/: python diagnose_networks.py
"""

from app.database import SessionLocal
from app.models import Network, Game
from collections import Counter

def diagnose():
    db = SessionLocal()

    all_networks = db.query(Network).all()
    print("All Network rows (id, name, linked services):")
    for n in all_networks:
        service_names = [s.name for s in n.services]
        print(f"  id={n.id} | '{n.name}' | services: {service_names}")

    # Check for duplicate names pointing to different ids
    name_counts = Counter(n.name for n in all_networks)
    dupes = {name: count for name, count in name_counts.items() if count > 1}
    if dupes:
        print(f"\n*** DUPLICATE NETWORK NAMES FOUND: {dupes} ***")
    else:
        print("\nNo duplicate network names found.")

    # For Prime Video specifically: which network id(s) do actual games point to?
    prime_networks = [n for n in all_networks if n.name == "Prime Video"]
    print(f"\n'Prime Video' network row(s): {[(n.id, [s.name for s in n.services]) for n in prime_networks]}")

    games_pointing_to_prime = db.query(Game).join(Network).filter(Network.name == "Prime Video").all()
    game_network_ids = Counter(g.network_id for g in games_pointing_to_prime)
    print(f"Games grouped by network_id they actually point to: {dict(game_network_ids)}")

    db.close()


if __name__ == "__main__":
    diagnose()