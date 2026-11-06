# Architecture

## Status

This is a proposed architecture for the college-project MVP. Confirm the stack and unresolved behaviors in `PROJECT_BRIEF.md` and `decisions/ADR-0001-project-defaults.md` before implementation.

## Approved Lightweight Stack

- **Frontend:** Plain HTML5, CSS3, Vanilla browser JavaScript. No React, Vite, or frontend framework.
- **Backend:** Node.js and Express REST API (served on single origin alongside static files).
- **Database:** Local SQLite database file via `better-sqlite3` (WAL mode enabled).
- **QR Generation:** Backend QR generation using `qrcode` library (data URI/SVG) and frontend display.
- **QR Scanner:** Client-side camera scanning using `html5-qrcode` library, plus manual text token fallback.
- **Security:** Node.js built-in `crypto` for HMAC-SHA256 signing and unguessable random nonces/tokens.
- **Testing:** Node.js built-in test runner (`node:test`).

## Runtime components

1. **Passenger web views:** Station selection, interactive route map, route/fare quote, demo checkout, and QR ticket display.
2. **Gate simulator view:** Demo entry/exit validation with camera scanner and manual input fallback.
3. **Admin dashboard:** Protected network management (stations, connections), fare slab viewing, ticket auditing, and validation event log.
4. **REST API:** Express routers providing stations, routes, fares, orders, payment, tickets, validation, and admin actions.
5. **Network graph service:** In-memory graph of active stations and connections loaded from SQLite at boot and reloaded upon admin edits.
6. **Route engine:** Dijkstra algorithm with `(station, line)` state tracking to calculate exact travel times, line changes, and a 5-minute interchange penalty for fastest mode vs fewest-interchange mode.
7. **Fare engine:** Pure deterministic calculation based on server-calculated route distance and configured slabs.
8. **Order & payment simulator:** Idempotent order tracking via unique `idempotency_key` and simulated payment outcomes.
9. **Ticket & token service:** Secure random nonce, 120-minute expiry, HMAC-SHA256 signature generation and validation.
10. **Gate validation engine:** Atomic check-and-update transaction verifying signature, expiry, state (`ACTIVE -> IN_TRIP -> USED`), origin for entry, and destination/intermediate slab check for exit.
11. **SQLite (`metro_afc.db`):** Local relational database for durable storage.

## Data model (SQLite schema)

- `stations`: `id` (INTEGER PRIMARY KEY), `code` (TEXT UNIQUE), `name` (TEXT), `line_code` (TEXT), `is_interchange` (INTEGER DEFAULT 0), `is_active` (INTEGER DEFAULT 1).
- `lines`: `id` (TEXT PRIMARY KEY), `name` (TEXT), `color` (TEXT).
- `connections`: `id` (INTEGER PRIMARY KEY), `from_station_id` (INTEGER), `to_station_id` (INTEGER), `line_id` (TEXT), `distance_km` (REAL), `travel_minutes` (REAL), `is_active` (INTEGER DEFAULT 1).
- `fare_rules`: `id` (INTEGER PRIMARY KEY), `min_km` (REAL), `max_km` (REAL), `fare_inr` (INTEGER).
- `orders`: `id` (INTEGER PRIMARY KEY), `order_id` (TEXT UNIQUE), `idempotency_key` (TEXT UNIQUE), `origin_station_id` (INTEGER), `destination_station_id` (INTEGER), `route_mode` (TEXT), `route_snapshot` (TEXT JSON), `fare_amount` (INTEGER), `payment_status` (TEXT), `created_at` (TEXT).
- `tickets`: `id` (INTEGER PRIMARY KEY), `ticket_id` (TEXT UNIQUE), `order_id` (INTEGER UNIQUE REFERENCES orders(id)), `guest_access_token` (TEXT UNIQUE), `nonce` (TEXT), `origin_station_id` (INTEGER), `destination_station_id` (INTEGER), `route_snapshot` (TEXT JSON), `fare_amount` (INTEGER), `status` (TEXT), `issued_at` (TEXT), `expires_at` (TEXT), `entered_station_id` (INTEGER), `entered_at` (TEXT), `exited_station_id` (INTEGER), `exited_at` (TEXT).
- `validation_events`: `id` (INTEGER PRIMARY KEY), `ticket_id` (TEXT), `event_type` (TEXT), `station_id` (INTEGER), `status` (TEXT: SUCCESS / REJECTED), `reason` (TEXT), `timestamp` (TEXT).
- `admin_sessions`: `id` (INTEGER PRIMARY KEY), `token` (TEXT UNIQUE), `created_at` (TEXT), `expires_at` (TEXT).


## Graph and route calculation

Represent connections as graph edges. Since a line change affects cost, a route-search state must include both station and current line (or use an equivalent correct model). Candidate cost can be travel minutes plus a configurable interchange penalty when the line changes. Keep fastest and fewest-interchanges modes explicit; for the latter, prefer a lexicographic objective (interchanges first, time second) or document and test a carefully bounded penalty.

Exclude inactive stations and connections. Reject identical origin and destination before searching. Return an explicit no-route error for disconnected nodes. The graph cache must be rebuilt when network data changes; for this project, rebuilding after an admin save is sufficient.

## Fare calculation

The browser requests a quote, but the backend recomputes route distance and fare during order creation. Define slab intervals without overlap, such as `[0, 2)`, `[2, 5)`, `[5, 12)`, and `[12, infinity)`. Confirm the actual amounts with the project owner; example amounts are not real operator pricing.

Keep `calculateFare(...)` pure: no database or clock reads inside it. Pass time/off-peak eligibility and fare rules as explicit values so repeated inputs yield the same result. Define currency, rounding, passenger-count bounds, and invalid-input behavior.

## Order and simulated payment flow

1. Client sends origin, destination, passenger count, and an idempotency key.
2. Server validates inputs, recalculates route and fare, and creates or returns the order associated with that key.
3. Demo payment service determines success/failure without accepting payment credentials.
4. On success, a database transaction marks the order paid and issues exactly one ticket.
5. Repeated requests with the same key return the existing order/ticket outcome.

## QR token and validation

Use a compact, versioned token format with payload fields limited to ticket ID, nonce, and expiry, then authenticate the exact payload bytes with HMAC-SHA256. Encode safely for URLs/QR size (for example base64url payload plus signature). Verification must reject malformed encodings, unknown token versions, expired timestamps, and invalid signatures. Use a cryptographically secure nonce and a strong server secret from environment configuration.

The signed token proves the payload has not been modified. It does not replace database checks: the API must verify that the ticket exists, matches its nonce, is in the expected state, and has not already been used. Entry and exit state changes must be transactional/conditional to prevent concurrent scans from succeeding twice.

Ticket state proposal: `ACTIVE -> IN_TRIP -> USED`, with `EXPIRED` and `CANCELLED` terminal outcomes. The rule for exiting at a station other than the destination is unresolved and must be decided before implementing exit validation.

## API contract proposal

- `GET /api/v1/stations` — active stations and basic metadata.
- `POST /api/v1/routes/quote` — origin, destination, route mode; returns route details.
- `POST /api/v1/fares/quote` — route/distance context, time context, passengers; server returns fare breakdown.
- `POST /api/v1/orders` — journey details and idempotency key; server recalculates route/fare and creates or returns the order.
- `POST /api/v1/orders/:id/demo-payment` — simulate success/failure; no payment credentials.
- `GET /api/v1/tickets/:id` — ticket details through the chosen passenger access model.
- `POST /api/v1/validation/entry` — signed token and station ID; validate and record entry.
- `POST /api/v1/validation/exit` — signed token and station ID; validate and record exit.
- `/api/v1/admin/...` — protected network, fare, ticket, and report endpoints.

Use consistent validation errors and avoid returning signature, secret, or internal database details.

## Security and privacy

- Store only password hashes; enforce admin authorization in the API.
- Keep HMAC and session secrets server-side in environment configuration.
- Never collect real card/UPI values in demo payment forms.
- Recompute all prices server-side; validate passenger count, station status, route, expiry, and ticket state.
- Rate-limit authentication and repeated invalid validation attempts.
- Avoid logging the complete signed token or personal data.
- Use HTTPS in deployment; camera-based scanning may require a secure browser context.
- Keep guest ticket access design minimal; decide whether lookup uses an unguessable private link/token.

## Deployment shape

Local self-contained Node.js process serving both static frontend files (HTML/CSS/JS) and the Express JSON API. Persistent data is maintained in the local SQLite database file `metro_afc.db`. No external cloud databases, microservices, or third-party APIs are required.
