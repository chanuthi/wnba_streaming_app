"""
Pydantic schemas define what your API actually returns as JSON.
Models (in models.py) define your DATABASE tables.
Schemas define your API's CONTRACT with whoever calls it (your React app, etc.)
These are deliberately separate: your database can have columns you never
expose, or computed fields (like `status` below) that don't exist as a
column at all.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TeamOut(BaseModel):
    id: int
    name: str
    abbreviation: Optional[str] = None

    class Config:
        from_attributes = True  # lets Pydantic read this straight from a SQLAlchemy object


class GameOut(BaseModel):
    id: int
    game_datetime: datetime
    home_team: str
    away_team: str
    network: Optional[str]       # the raw network name, or None
    status: str                  # "streaming" | "local_broadcast" | "not_listed"
    streaming_services: list[str]  # empty list if status isn't "streaming"

    class Config:
        from_attributes = True