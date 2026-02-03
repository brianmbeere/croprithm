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
