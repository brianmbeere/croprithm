"""Connection configuration for the API and database maintenance scripts."""

import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, URL, make_url

load_dotenv()


def get_database_url() -> URL:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in the environment")

    url = make_url(database_url)
    if url.drivername == "postgres":
        url = url.set(drivername="postgresql")

    db_name = os.getenv("DB_NAME")
    if db_name is not None:
        if url.get_backend_name() != "postgresql":
            raise ValueError("DB_NAME is only supported for PostgreSQL")
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", db_name):
            raise ValueError(
                "DB_NAME must be 1-63 lowercase ASCII letters, digits or "
                "underscores, starting with a letter or underscore"
            )
        if "dbname" in url.query:
            raise ValueError("Remove dbname from DATABASE_URL query when using DB_NAME")
        url = url.set(database=db_name)

    return url


def _pool_setting(name: str, default: int, minimum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        raise ValueError(f"{name} must be an integer >= {minimum}") from None
    if value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")
    return value


def create_database_engine() -> Engine:
    url = get_database_url()
    if url.get_backend_name() == "postgresql":
        return create_engine(
            url,
            pool_size=_pool_setting("DB_POOL_SIZE", 2, 1),
            max_overflow=_pool_setting("DB_MAX_OVERFLOW", 1, 0),
            pool_timeout=_pool_setting("DB_POOL_TIMEOUT", 30, 1),
            pool_recycle=_pool_setting("DB_POOL_RECYCLE", 1800, 1),
            pool_pre_ping=True,
        )
    return create_engine(url)
