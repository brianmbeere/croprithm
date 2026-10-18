import os
import unittest
from unittest.mock import patch

from sqlalchemy import text

from app.core.database_config import create_database_engine, get_database_url


class DatabaseConfigTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "DATABASE_URL": (
                    "postgresql://pilot:p%40ss%2Fword@localhost:5432/original"
                    "?sslmode=require"
                ),
                "DB_NAME": "routecast_pilot",
                "DB_POOL_SIZE": "2",
                "DB_MAX_OVERFLOW": "1",
                "DB_POOL_TIMEOUT": "30",
                "DB_POOL_RECYCLE": "1800",
            },
            clear=True,
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_override_preserves_connection_details(self):
        url = get_database_url()
        self.assertEqual(url.database, "routecast_pilot")
        self.assertEqual(url.password, "p@ss/word")
        self.assertEqual(url.host, "localhost")
        self.assertEqual(url.port, 5432)
        self.assertEqual(url.query["sslmode"], "require")

    def test_unique_url_without_override(self):
        del os.environ["DB_NAME"]
        os.environ["DATABASE_URL"] = "postgres://localhost/routecast_pilot"
        url = get_database_url()
        self.assertEqual(url.database, "routecast_pilot")
        self.assertEqual(url.drivername, "postgresql")

    def test_missing_url(self):
        del os.environ["DATABASE_URL"]
        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
            get_database_url()

    def test_invalid_names(self):
        for name in ("", "two words", "other/db", "MixedCase", "a" * 64):
            with self.subTest(name=name):
                os.environ["DB_NAME"] = name
                with self.assertRaisesRegex(ValueError, "DB_NAME"):
                    get_database_url()

    def test_conflicting_query_database(self):
        os.environ["DATABASE_URL"] = "postgresql://localhost/base?dbname=wrong"
        with self.assertRaisesRegex(ValueError, "dbname"):
            get_database_url()

    def test_pool_configuration(self):
        with patch("app.core.database_config.create_engine") as factory:
            create_database_engine()
        self.assertEqual(factory.call_args.kwargs, {
            "pool_size": 2, "max_overflow": 1, "pool_timeout": 30,
            "pool_recycle": 1800, "pool_pre_ping": True,
        })

    def test_invalid_pool_settings(self):
        for setting, value in (
            ("DB_POOL_SIZE", "0"), ("DB_MAX_OVERFLOW", "-1"),
            ("DB_POOL_TIMEOUT", "invalid"), ("DB_POOL_RECYCLE", "0"),
        ):
            with self.subTest(setting=setting), patch.dict(os.environ, {setting: value}):
                with self.assertRaisesRegex(ValueError, setting):
                    create_database_engine()

    def test_sqlite_behavior(self):
        del os.environ["DB_NAME"]
        os.environ["DATABASE_URL"] = "sqlite:///:memory:"
        engine = create_database_engine()
        try:
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT 1")).scalar_one(), 1)
        finally:
            engine.dispose()
        os.environ["DB_NAME"] = "routecast_pilot"
        with self.assertRaisesRegex(ValueError, "PostgreSQL"):
            get_database_url()


if __name__ == "__main__":
    unittest.main()
