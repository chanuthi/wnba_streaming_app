"""
FastAPI application entrypoint.

Run from the backend/ folder:
    uvicorn app.main:app --reload

Then visit http://127.0.0.1:8000/docs for interactive API docs
(FastAPI generates this automatically from your endpoints + schemas).
"""

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.models import Game, Team
from app.schemas import GameOut, TeamOut
from app.coverage import calculate_best_plans

app = FastAPI(title="WNBA Streaming Finder API")

# Allows your React frontend (running on a different port/domain) to call this API.
# Tighten allow_origins to your actual frontend URL before deploying publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_game_out(game: Game) -> GameOut:
    """
    Turns a raw Game database row into the API's GameOut shape,
    including the derived `status` field discussed in the roadmap.
    """
    if game.network is None:
        status = "not_listed"
        network_name = None
        services = []
    elif game.network.name == "Local Broadcast":
        status = "local_broadcast"
        network_name = game.network.name
        services = []
    else:
        status = "streaming"
        network_name = game.network.name
        services = [s.name for s in game.network.services]

    return GameOut(
        id=game.id,
        game_datetime=game.game_datetime,
        home_team=game.home_team.name,
        away_team=game.away_team.name,
        network=network_name,
        status=status,
        streaming_services=services,
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/teams", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    return db.query(Team).order_by(Team.name).all()


@app.get("/games", response_model=list[GameOut])
def list_games(
        team_id: Optional[int] = Query(None, description="Filter to games for one team (home or away)"),
        start_date: Optional[datetime] = Query(None, description="Only games on/after this datetime"),
        end_date: Optional[datetime] = Query(None, description="Only games on/before this datetime"),
        db: Session = Depends(get_db),
):
    query = db.query(Game)

    if team_id is not None:
        query = query.filter(
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id)
        )
    if start_date is not None:
        query = query.filter(Game.game_datetime >= start_date)
    if end_date is not None:
        query = query.filter(Game.game_datetime <= end_date)

    games = query.order_by(Game.game_datetime).all()
    return [build_game_out(g) for g in games]


@app.get("/recommend")
def recommend_plan(
        team_id: int = Query(..., description="The user's favorite team"),
        zip_code: str = Query(..., min_length=5, max_length=5, description="US 5-digit zip code"),
        db: Session = Depends(get_db),
):
    """
    Given a favorite team and zip code, returns which single subscription
    (and which 2-service combo) covers the most of that team's games,
    accounting for local blackout rules based on the viewer's market.
    """
    team = db.query(Team).filter_by(id=team_id).first()
    if not team:
        return {"error": f"No team found with id {team_id}"}

    result = calculate_best_plans(db, team_id, zip_code)
    result["team"] = team.name
    result["zip_code"] = zip_code
    return result