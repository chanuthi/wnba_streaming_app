"""
Database connection and session setup.
Reads DATABASE_URL from a .env file so the connection string never lives in code.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Resolved relative to this file, not the process's cwd - load_dotenv() with
# no path only searches upward from the current working directory, which
# breaks the same way the old SQLite default path did when uvicorn isn't
# launched with backend/ as its cwd (see the launch.json workaround).
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

# Example values for .env:
#   Postgres: DATABASE_URL=postgresql://postgres:devpass@localhost:5432/wnba
#   SQLite (simplest to start): DATABASE_URL=sqlite:///./wnba.db

# Falls back to an absolute path (backend/wnba.db) rather than a cwd-relative one,
# since uvicorn isn't always launched with backend/ as the working directory.
_DEFAULT_SQLITE_URL = "sqlite:///" + os.path.join(_BACKEND_DIR, "wnba.db")

DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_SQLITE_URL)

# check_same_thread is only needed for SQLite; harmless to set conditionally
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# pool_pre_ping: test each pooled connection with a cheap "is it alive"
# check before handing it to a query, transparently reconnecting if not.
# Needed because Neon (like most managed Postgres) closes connections that
# sit idle for a while server-side - without this, SQLAlchemy doesn't find
# out a pooled connection is dead until a real query fails against it
# (surfaced as psycopg2.OperationalError: SSL connection has been closed
# unexpectedly). pool_recycle proactively retires connections after 5
# minutes so they're refreshed before Neon has a chance to close them.
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency - yields a session, closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
