"""
Core recommendation logic: given a favorite team and a zip code, figure out
which subscription (or combo of two) covers the most of that team's games.

The blackout rule this encodes (confirmed against WNBA's own rules):
    - Nationally televised games (ESPN, ABC, Prime, etc.) are NEVER on
      League Pass live, regardless of where you live.
    - Locally televised games are blacked out on League Pass ONLY for
      people inside that team's home market. Outside that market, the
      same local game IS available on League Pass.
    - A local game watched by someone IN that team's market isn't
      coverable by any subscription in this system at all — it needs
      actual local TV/cable, which is out of scope for a streaming-only
      recommender. We surface this honestly instead of hiding it.
"""

from collections import defaultdict
from itertools import combinations
from sqlalchemy.orm import Session

from app.models import Game, Team, TeamMarketZip, Service


def is_in_market(db: Session, team_id: int, zip_code: str) -> bool:
    """True if the given zip code falls inside the team's home market."""
    zip3 = zip_code[:3]
    match = (
        db.query(TeamMarketZip)
        .filter(TeamMarketZip.team_id == team_id, TeamMarketZip.zip_prefix == zip3)
        .first()
    )
    return match is not None


def get_game_coverage(db: Session, team_id: int, zip_code: str):
    """
    Returns a list of per-game coverage info:
        {"game": Game, "covering_services": set[str] | None, "reason": str}
    covering_services is None when nothing in our system can cover it
    (in-market local broadcast) — that's a deliberate, visible gap, not a bug.
    """
    in_market = is_in_market(db, team_id, zip_code)

    games = (
        db.query(Game)
        .filter((Game.home_team_id == team_id) | (Game.away_team_id == team_id))
        .all()
    )

    results = []
    for g in games:
        if g.network is None:
            results.append({"game": g, "covering_services": None, "reason": "not_listed"})
        elif g.network.name == "Local Broadcast":
            if in_market:
                # In-market local game: no subscription in our system covers this,
                # only actual local TV/cable/antenna. Surfaced honestly, not hidden.
                results.append({"game": g, "covering_services": None, "reason": "in_market_local"})
            else:
                # Out-of-market local game: covered by League Pass, per WNBA's own rules.
                results.append({"game": g, "covering_services": {"WNBA League Pass"}, "reason": "league_pass"})
        else:
            services = {s.name for s in g.network.services}
            results.append({"game": g, "covering_services": services, "reason": "national_or_mapped"})

    return results, in_market


def calculate_best_plans(db: Session, team_id: int, zip_code: str) -> dict:
    """
    Main entrypoint: returns single-best-service and best-2-service-combo
    coverage stats for a team, given a viewer's zip code.
    """
    coverage, in_market = get_game_coverage(db, team_id, zip_code)

    # Name -> monthly price, so per-service coverage counts (which only ever
    # deal in service NAMES, from Network.services) can be turned into a
    # cost/value figure without re-querying per service.
    service_prices = {s.name: s.monthly_price for s in db.query(Service).all()}

    total_games = len(coverage)
    not_listed_count = sum(1 for c in coverage if c["reason"] == "not_listed")
    in_market_local_count = sum(1 for c in coverage if c["reason"] == "in_market_local")

    coverable = [c for c in coverage if c["covering_services"]]
    coverable_count = len(coverable)

    # Tally how many coverable games each individual service unlocks
    single_service_counts = defaultdict(int)
    for c in coverable:
        for service in c["covering_services"]:
            single_service_counts[service] += 1

    all_services = list(single_service_counts.keys())

    def _count_then_cheaper(item):
        # Rank by games covered first; on a tie, prefer the cheaper service
        # instead of whichever happened to be seen first.
        name, count = item
        price = service_prices.get(name)
        return (count, -price if price is not None else float("-inf"))

    best_single = None
    if single_service_counts:
        best_name, best_count = max(single_service_counts.items(), key=_count_then_cheaper)
        best_price = service_prices.get(best_name)
        best_single = {
            "service": best_name,
            "games_covered": best_count,
            "pct_of_coverable": round(100 * best_count / coverable_count, 1) if coverable_count else 0,
            "monthly_price": best_price,
            "cost_per_game": round(best_price / best_count, 2) if best_price is not None else None,
        }

    # Best 2-service combo: brute-force over all pairs (service list is small, ~10 max).
    # Scored by UNION size (covered by a OR b), not a sum - so a pair where one
    # service is a subset of the other never outscores a genuinely additive pair.
    best_combo = None
    best_combo_count = -1
    best_combo_price = None
    for a, b in combinations(all_services, 2):
        count = sum(1 for c in coverable if c["covering_services"] & {a, b})
        combo_price = (service_prices.get(a) or 0) + (service_prices.get(b) or 0)
        if count > best_combo_count or (count == best_combo_count and combo_price < best_combo_price):
            best_combo_count = count
            best_combo = (a, b)
            best_combo_price = combo_price

    best_combo_result = None
    if best_combo:
        a, b = best_combo

        # How much each side actually contributes on its own, not just the
        # total union - this is what proves the combo is genuinely
        # complementary rather than one service dragging along a redundant
        # second subscription that happens to tie on total count.
        unique_to_a = sum(
            1 for c in coverable if a in c["covering_services"] and b not in c["covering_services"]
        )
        unique_to_b = sum(
            1 for c in coverable if b in c["covering_services"] and a not in c["covering_services"]
        )
        overlap = sum(
            1 for c in coverable if a in c["covering_services"] and b in c["covering_services"]
        )

        # Only call it a "combo" if both sides pull real weight. If one side
        # contributes zero unique games, the second subscription adds nothing
        # over best_single alone, so there's nothing worth recommending here.
        if unique_to_a > 0 and unique_to_b > 0:
            best_combo_result = {
                "services": [a, b],
                "games_covered": best_combo_count,
                "pct_of_coverable": round(100 * best_combo_count / coverable_count, 1) if coverable_count else 0,
                "unique_to_first": unique_to_a,
                "unique_to_second": unique_to_b,
                "overlap": overlap,
                "total_monthly_price": round(best_combo_price, 2) if best_combo_price is not None else None,
            }

    # Full per-service breakdown, sorted highest coverage first; on a tie,
    # cheaper service first (same tie-break as best_single above).
    breakdown = sorted(
        [
            {
                "service": name,
                "games_covered": count,
                "pct_of_coverable": round(100 * count / coverable_count, 1) if coverable_count else 0,
                "monthly_price": service_prices.get(name),
                "cost_per_game": round(service_prices[name] / count, 2) if service_prices.get(name) is not None else None,
            }
            for name, count in single_service_counts.items()
        ],
        key=lambda x: (-x["games_covered"], x["monthly_price"] if x["monthly_price"] is not None else float("inf")),
    )

    return {
        "in_market": in_market,
        "total_games": total_games,
        "not_listed_games": not_listed_count,
        "in_market_local_only_games": in_market_local_count,
        "coverable_games": coverable_count,
        "best_single_service": best_single,
        "best_two_service_combo": best_combo_result,
        "service_breakdown": breakdown,
    }