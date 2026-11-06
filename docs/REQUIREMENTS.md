# Product Requirements

## Status and priority

Priorities use Must, Should, Could, and Won't for the first version. Requirements below are the proposed MVP baseline and should be confirmed against course instructions.

## Functional requirements

### Network and stations
 
- **MUST NET-01:** The system stores stations, lines, and connections between stations in SQLite.
- **MUST NET-02:** A station can be marked active or closed. Closed stations must not be offered for new routes.
- **MUST NET-03:** A connection stores the line, travel minutes, and distance needed by route and fare calculations.
- **MUST NET-04:** Two synthetic lines are seeded: Blue Line (6 stations: B1 Bayview, B2 Harbor Point, B3 Tech Park, B4 Central Junction, B5 Market Square, B6 Sunrise Hills) and Red Line (6 stations: R1 Airport City, R2 Aero Club, R3 Central Junction, R4 Grand University, R5 Green Meadows, R6 South Park). Central Junction is the shared interchange.
- **MUST NET-05:** In-memory network graph is loaded at startup and reloaded when an administrator modifies stations or connections.
 
 ### Route selection
 
- **MUST ROUTE-01:** A passenger selects distinct origin and destination stations.
- **MUST ROUTE-02:** The server calculates a route over the network graph using Dijkstra's algorithm with station-and-line search state so line changes are counted correctly.
- **MUST ROUTE-03:** Support two modes:
  - **Fastest-route:** Minimizes total travel time including a configurable 5-minute penalty per interchange, then prefers fewer transfers.
  - **Fewest-interchanges:** Minimizes transfers first, then actual travel time.
- **MUST ROUTE-04:** The response contains ordered stations, line segments, stop count, interchange stations, total minutes, and total distance.
- **MUST ROUTE-05:** The system rejects identical origin/destination stations, closed stations, and returns a clear result when no route exists.
 
 ### Fare and order
 
- **MUST FARE-01:** Fare slabs are stored in SQLite:
  - [0, 2) km: ₹10
  - [2, 5) km: ₹20
  - [5, 12) km: ₹30
  - [12, inf) km: ₹40
- **MUST FARE-02:** The fare function is deterministic, pure, and testable: `calculateFare(distanceKm)`. Rejects zero or negative distance.
- **MUST FARE-03:** The quote API returns the route and fare for display.
- **MUST FARE-04:** `POST /api/v1/orders` recalculates route and fare on the server and ignores any browser-supplied price. Supports single passenger per order.
- **MUST ORDER-05:** The order/payment flow is idempotent via an idempotency key. Retrying the same request returns the existing order/ticket without duplication.
 
 ### Simulated payment and ticket issuing
 
- **MUST PAY-01:** The UI clearly says “Demo payment — no real money.”
- **MUST PAY-02:** Payment is simulated with clear success and failure options. Do not collect or store actual card numbers, UPI IDs, PINs, or credentials.
- **MUST PAY-03:** A test failure option is supported without creating a ticket.
- **MUST TICKET-04:** A ticket is created only after successful simulated payment.
- **MUST TICKET-05:** Each ticket has a unique UUID, status, journey snapshot, issue time, and 120-minute expiry (for unused state).
- **MUST TICKET-06:** The QR token contains only `ticketId`, `nonce`, and `expiry`, signed with HMAC-SHA256 using a server-side secret stored in `.env`.
- **MUST TICKET-07:** The QR contains no fare, passenger name, or personal data.
- **MUST TICKET-08:** Guest access to ticket details is provided through an unguessable guest access token.
 
 ### Gate validation
 
- **MUST GATE-01:** The gate simulator supports Entry and Exit modes.
- **MUST GATE-02:** Validation verifies token signature, expiry, ticket existence, nonce, ticket state, and applicable station rule.
- **MUST GATE-03:** Successful entry requires the station to be the ticket's origin, transitions state from `ACTIVE` to `IN_TRIP` atomically, and records entry time and station. Once in trip, the passenger can exit without automatic timeout.
- **MUST GATE-04:** Successful exit allows the ticket destination or any intermediate station on the route provided the distance traveled from origin fits within the paid fare slab. Transitions state from `IN_TRIP` to `USED` atomically.
- **MUST GATE-05:** Reject exits beyond the destination station or where distance exceeds the paid slab.
- **MUST GATE-06:** A used, expired, malformed, tampered, or otherwise invalid token is rejected with an informative message.
- **MUST GATE-07:** Validation attempts (both success and failure) are recorded in SQLite without logging the complete secret token.
- **MUST GATE-08:** Camera scanning using `html5-qrcode` asks for permission first; manual token entry is always available as fallback.
 
 ### Administration
 
- **MUST ADMIN-01:** Admin-only functions are protected by backend session/token authorization.
- **MUST ADMIN-02:** An administrator can review stations, connections, fare rules, tickets, and validation events.
- **MUST ADMIN-03:** Administrators can edit stations (toggle active/closed) and connections through the UI, triggering network graph refresh.
- **MUST ADMIN-04:** Summary metrics (ticket count by status, validation success/failure counts) are displayed.
 
 ## Non-functional requirements
 
- **MUST NFR-01:** Fare and ticket state decisions are enforced by the server, not just the UI.
- **MUST NFR-02:** The interface is responsive on mobile and desktop, with accessible labels, keyboard support, and clear contrast.
- **MUST NFR-03:** Secrets (`HMAC_SECRET`, `ADMIN_PASSWORD`) are loaded via `dotenv` from `.env`, excluded from version control, with `.env.example` provided.
- **MUST NFR-04:** Core business logic has automated checks using Node’s built-in test runner (`node:test`).
- **MUST NFR-05:** API errors are consistent and understandable without leaking internal errors.
- **MUST NFR-06:** Served on a single origin by Express to eliminate CORS requirements.
 
 ## Out of scope for the first version
 
- Real payment provider, live operator API, or physical AFC gate hardware.
- Real-time transit GPS tracking.
- Multi-passenger tickets or return trip discounts.
- Offline-only cryptographic validation at a gate.

## Acceptance scenario

Given two active connected stations and configured fare slabs, when the passenger requests a quote, the API returns route details and a server-calculated fare. When the passenger completes a successful demo payment, the backend creates exactly one ticket and returns its QR token. The entry simulator accepts it once at the allowed station; a repeat entry fails. The exit simulator applies the confirmed exit rule, records the exit, and marks the ticket used.
