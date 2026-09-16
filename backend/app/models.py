"""
SQLAlchemy models for the WNBA streaming app.

Schema shape:
    Team    <--- home/away ---  Game  --- aired on --->  Network
    Network <---  many-to-many  --->  Service (a network can stream on several
                                        services, e.g. ESPN -> YouTube TV, Hulu Live)
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


# Join table for the many-to-many relationship between Network and Service.
# No extra columns needed here, so a plain Table (not a full model class) is enough.
network_service_association = Table(
    "network_service",
    Base.metadata,
    Column("network_id", Integer, ForeignKey("networks.id"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id"), primary_key=True),
)


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "New York Liberty"
    abbreviation = Column(String, nullable=True)         # e.g. "NY"

    # A team appears in many games, either as home or away
    home_games = relationship(
        "Game", foreign_keys="Game.home_team_id", back_populates="home_team"
    )
    away_games = relationship(
        "Game", foreign_keys="Game.away_team_id", back_populates="away_team"
    )

    # Zip-code prefixes that count as this team's home market (see TeamMarketZip)
    market_zips = relationship("TeamMarketZip", back_populates="team")


class TeamMarketZip(Base):
    """
    Maps a team to the zip-code prefixes considered its home broadcast market.
    Approximate by design (3-digit zip prefix, not precise Nielsen DMA data) —
    good enough to answer "is this user in-market for this team," which is
    all the blackout-coverage logic actually needs.
    """
    __tablename__ = "team_market_zips"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    zip_prefix = Column(String, nullable=False)  # e.g. "941" matches 941xx zips

    team = relationship("Team", back_populates="market_zips")


class Network(Base):
    __tablename__ = "networks"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "ESPN", "Prime Video"

    games = relationship("Game", back_populates="network")

    # A network can be carried on several streaming services (or be its own app,
    # e.g. Prime Video maps to itself)
    services = relationship(
        "Service", secondary=network_service_association, back_populates="networks"
    )


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "YouTube TV", "Hulu+ Live TV"

    # Pricing/metadata below is sourced from data/services.json where available
    # (nullable: a couple of services predate that file and have no curated entry
    # yet - see the SUPPLEMENTAL_SERVICES note in seed_data.py).
    monthly_price = Column(Float, nullable=True)   # USD/month, 0.0 = free
    annual_price = Column(Float, nullable=True)    # USD/year, for services with an annual plan
    one_time_price = Column(Float, nullable=True)  # USD, one-time cost (e.g. antenna hardware)
    service_type = Column(String, nullable=True)   # e.g. "svod", "live_tv", "league_dtc", "ota"
    special_rules = Column(String, nullable=True)  # free-text caveats (blackout rules, promo pricing, etc.)
    url = Column(String, nullable=True)

    networks = relationship(
        "Network", secondary=network_service_association, back_populates="services"
    )


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True)
    espn_event_id = Column(String, unique=True, nullable=False)  # ESPN's own game id, for dedup
    game_datetime = Column(DateTime, nullable=False)             # combined date+time, UTC

    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    network_id = Column(Integer, ForeignKey("networks.id"), nullable=True)  # nullable: TBD games

    home_team = relationship("Team", foreign_keys=[home_team_id], back_populates="home_games")
    away_team = relationship("Team", foreign_keys=[away_team_id], back_populates="away_games")
    network = relationship("Network", back_populates="games")