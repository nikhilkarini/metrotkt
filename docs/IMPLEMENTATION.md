# Implementation Plan

## Working method

Build one vertical slice at a time. Each task should have a visible or system-verifiable outcome, acceptance criteria, and checks. Update this plan when discoveries change the sequence.

## Phase 0 — Confirm scope and decisions

- Confirm course constraints, stack, deadline, demo environment, sample network, fare amounts, exit rule, and passenger access model.
- Mark proposed choices as accepted or replace them in `ADR-0001`.
- **Exit check:** no unresolved decision blocks the database or ticket lifecycle.

## Phase 1 — Repository baseline

- Initialize the app using the approved stack, Git, environment template, source folders, and test setup.
- Add sample network data and document setup/run commands.
- **Acceptance:** a fresh setup can start the application and run its baseline checks.

## Phase 2 — Network and route service

- Model stations, lines, connections, and active state.
- Load graph into memory and implement Dijkstra with line-change handling.
- Add route quote endpoint and basic station selection UI.
- **Acceptance:** results include station order, segments, stops, interchanges, minutes, and distance; same-station, closed, and unreachable cases behave as specified.

## Phase 3 — Fare quote

- Add fare rules and pure fare calculation.
- Add quote display and server validation of fare inputs.
- **Acceptance:** all slab boundaries, rounding, and passenger rules have automated checks; client-supplied price cannot control the result.

## Phase 4 — Idempotent order and demo payment

- Create orders using an idempotency key.
- Simulate server-side success/failure without collecting real credentials.
- **Acceptance:** retrying a successful request returns the existing outcome and does not issue duplicate tickets; failed payment issues none.

## Phase 5 — Ticket and QR token

- Create ticket UUID, nonce, expiry, state, and HMAC-SHA256-signed compact token.
- Display a QR and ticket details.
- **Acceptance:** valid tokens verify; modified, malformed, unknown-version, and expired tokens fail; payload excludes fare and personal data.

## Phase 6 — Entry/exit gate simulator

- Add entry and exit API operations and simulator screen.
- Record successful and rejected validation events.
- Enforce ticket state transitions transactionally.
- **Acceptance:** entry succeeds once, repeated entry fails, and exit follows the confirmed station/fare rule and closes the trip.

## Phase 7 — Admin experience

- Add protected admin access and station/fare management.
- Add ticket and validation-event views and simple reports.
- **Acceptance:** non-admin requests are rejected by the API; admin updates are reflected in route/fare behavior.

## Phase 8 — End-to-end hardening and demo preparation

- Verify mobile layout, keyboard access, all loading/error/empty states, demo labels, and the full passenger-to-gate scenario.
- Review secrets, authorization, logs, database transactions, and deployment settings.
- **Acceptance:** quality checklist is complete or remaining limitations are explicitly recorded; demo can be run from documented steps.

## Suggested task size

Keep each implementation request focused, for example “implement same-station and unreachable route handling” rather than “build the metro backend.” For each task state the requirement IDs, non-goals, likely files, checks, and risks.
