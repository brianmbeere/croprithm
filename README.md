# Routecast

Routecast is a data-driven logistics decision-support platform designed to assist local food producers and restaurants with delivery planning and route coordination. The system supports regional food distribution by transforming operational inputs into optimized delivery routes that can be reviewed and executed by human operators.

![Route Optimization Interface](docs/images/route-optimizer.png)

---

## Overview

Small and mid-scale food producers often rely on manual planning to coordinate deliveries to multiple restaurant clients. Routecast supports this planning process by allowing users to define pickup locations, delivery destinations, and accepted produce requests, and then generating optimized route suggestions based on real road-network distance data.

The platform is designed to **support human decision-making**, not to automate logistics execution.

---

## Core Capabilities

- Multi-stop delivery route planning from a single pickup location  
- Route optimization using real road-network distance calculations  
- Interactive map-based visualization of suggested routes  
- Integration with produce request and inventory workflows  
- Historical tracking of planned and completed delivery routes  

---

## Route Planning Workflow

1. A producer selects a pickup location and one or more delivery destinations  
2. Routecast retrieves distance and travel duration data using routing services  
3. A deterministic optimization heuristic orders delivery stops to reduce total travel distance  
4. The suggested route is displayed visually for operator review  
5. Operators may save, reuse, or execute routes based on operational needs  

The screenshot above illustrates a typical route planning scenario with a pickup location and delivery stop rendered on the map interface.

---

## Architecture (High-Level)

### Backend
- Python-based backend implemented using FastAPI  
- Structured relational data storage using PostgreSQL and SQLAlchemy  
- External routing services used for distance and duration calculations  
- Authentication and access control handled via Firebase token verification  

### Frontend
- Web-based client built using TypeScript and Preact  
- Interactive route visualization using Mapbox GL JS  
- Role-based user flows for producers and restaurant users  

### Shared Render Postgres pilot

Routecast and Menurithm can share one Render Postgres instance using separate
logical databases. Both define a `users` table, so **do not point them at the
same logical database**.

1. Connect with the Render dashboard's PSQL command (owner role, direct port 5432)
   and run `CREATE DATABASE routecast_pilot;` once. Menurithm should use its own
   `menurithm_pilot` database on that instance. Database creation is an
   administrative step, not API startup work.
2. On Routecast's Render service, set `DATABASE_URL` to the instance's internal
   URL and `DB_NAME=routecast_pilot`. Set `DB_NAME=menurithm_pilot` on Menurithm.
   Keep services in the same region as Postgres. A full unique URL ending in
   `/routecast_pilot` also works with `DB_NAME` unset.
3. From Routecast's backend directory, run `python migrate_db.py` using the same
   environment before serving traffic. This imports the central engine and
   creates missing tables; it does not create the database or migrate existing
   columns. Routecast does not create tables in its main module.
4. Back up and restore existing data into the appropriate target before cutover;
   changing the URL does not copy data. Validate each application's data before
   retiring old instances.

[`backend/app/core/database_config.py`](backend/app/core/database_config.py)
loads `.env` without overriding Render environment variables and parses the URL
with SQLAlchemy. Optional `DB_NAME` replaces only its database path, preserving
credentials and query parameters; it takes precedence over the path. It accepts
1-63 lowercase ASCII letters, digits or underscores, starting with a letter or
underscore. Empty/invalid overrides, non-Postgres overrides and conflicting
`dbname` query parameters fail explicitly. Legacy `postgres://` is normalized.
Use service-specific DB_NAME values, not a common value in a shared environment
group. Never commit real connection URLs.

The central engine in
[`backend/app/db/database.py`](backend/app/db/database.py) uses these PostgreSQL
pool settings per worker process:

| Variable | Default |
| --- | --- |
| `DB_POOL_SIZE` | `2` |
| `DB_MAX_OVERFLOW` | `1` |
| `DB_POOL_TIMEOUT` | `30` seconds |
| `DB_POOL_RECYCLE` | `1800` seconds |

`pool_pre_ping=True` replaces stale connections on checkout, not interrupted
transactions. Connections open lazily. Settings must be integers; pool size,
timeout and recycle must be positive, and overflow must be nonnegative.
Non-Postgres engine options are unchanged. Keep request sessions closed using
the existing `get_db()` dependency.

Two single-worker APIs have a combined ceiling of six application connections
with these defaults. Multiply by worker and replica counts, and reserve capacity
for deployments, background jobs, migrations and administration. Render's
[$7 Starter Postgres is a legacy plan](https://render.com/docs/postgresql-legacy-instance-types)
with 97 connections shared by all logical databases, 256 MB RAM, 0.1 CPU and
1 GB storage; it is not offered for new instances. Verify the actual plan and
`SHOW max_connections;`, then monitor CPU, memory, storage and pool waits.

To verify the selected database from the backend directory:

```bash
python - <<'PY'
from sqlalchemy import text
from app.core.database_config import create_database_engine

engine = create_database_engine()
try:
    with engine.connect() as connection:
        print(connection.execute(text(
            "SELECT current_database(), current_user"
        )).one())
finally:
    engine.dispose()
PY
```

Expect `routecast_pilot`. Distinct databases prevent table collisions, but shared
owner credentials are not access-control isolation. Use separate roles and
database CONNECT permissions (including removing PUBLIC access) if required.
Resources, outages and instance-level connection limits remain shared.

Render offers optional [integrated PgBouncer](https://render.com/docs/postgresql-connection-pooling)
on paid databases at no additional cost. Bounded application pools are sufficient
to start. If enabling it, plan for a database restart, use the provided pool URL
(port 6432), and verify access to both logical databases before cutover.
Session-dependent features require direct connections; keep provisioning,
migrations and backups on direct port 5432.

### Free static frontend

The Preact frontend is a browser-only Vite SPA, not a server-rendered application.
[`render.yaml`](render.yaml) defines a free static site named `routecast-static`:

- Root directory: `frontend`
- Build: `npm ci --include=dev && npm run build`
- Publish directory: `dist`
- SPA rewrite: `/*` to `/index.html` (rewrite, not redirect)
- No start command or Vite preview server

Copy the current frontend's `VITE_*` settings at **build time**, keeping
`VITE_BACKEND_URL=https://routecast-core.onrender.com`, Firebase web configuration,
and the public Mapbox token (`VITE_MAP_BOX_API_TOKEN`, starting with `pk.`).
Changing build variables requires a rebuild. Required configuration, HTTPS API
URLs and the public Mapbox token are validated during production builds. For a
local production build with localhost development settings:

```bash
cd frontend
VITE_BACKEND_URL=https://routecast-core.onrender.com npm run build
```

All `VITE_*` settings are public browser configuration. Do not copy database
credentials, Firebase Admin keys, Mapbox secret tokens or service API keys into
the static site's environment.

Add `https://routecast-static.onrender.com` to the backend's **`ALLOWED_ORIGINS`**,
retaining the old origin during staging. Add `routecast-static.onrender.com` to
Firebase Authentication's authorized domains and any API-key referrer
restrictions; allow the new origin in the public Mapbox token's URL restrictions.
Verify maps, sign-in, API calls and direct `/signin` and `/dashboard` navigation
before suspending the old paid frontend.

The new site uses `routecast-static.onrender.com`; the old service's
`routecast.onrender.com` hostname does not automatically transfer or redirect
when suspended. Update links/bookmarks or move a custom domain after verification.
Static sites avoid a monthly compute charge, but workspace bandwidth and build
minutes can still be billed. Do not create a duplicate site by applying a new
Blueprint to a manually created resource without reconciling/importing it.

For the existing production data, use `DB_NAME=routecast` on the retained
Menurithm instance and leave Menurithm on its existing `menurithm` database.
The `_pilot` names above are fresh-install examples. The inspected live instances
are Basic 256 MB, not legacy Starter: the 5 GB Menurithm instance is the smaller
consolidation target. Retain the original 15 GB Routecast instance for rollback
until the consolidated deployment is accepted; it continues to incur charges
while retained.

---

## Analytics and Operational Visibility

Routecast records operational data associated with delivery planning, including:
- Number of delivery stops per route  
- Estimated travel distance  
- Route execution history  

These records support basic operational analysis and can be exported for reporting or review.

---

## Integration

Routecast is designed to interoperate with food service planning platforms such as **Menurithm**. Accepted produce requests and delivery-related data can be shared between systems through API-based integration, supporting coordinated planning across food preparation and logistics activities.

---

## Status

This repository contains an actively developed implementation of the Routecast platform. The system is designed for real-world operational use and ongoing iterative refinement.

---

## Author

**Brian Mbeere**  
Software Engineer focused on data-driven decision-support systems for food operations and logistics planning.
