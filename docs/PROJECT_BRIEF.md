# Project Brief

## Project

Metro Automatic Fare Collection Ticketing Website

## Problem and purpose

This college project demonstrates how the main parts of a metro Automatic Fare Collection (AFC) journey can work together in a website: route selection, fare calculation, ticket issuing, entry validation, exit validation, and operator administration.

## Intended users

- **Passenger:** Plans a trip, reviews the route and fare, completes the demo payment, and presents a QR ticket.
- **Gate validator:** Uses the gate-simulator interface to validate entry and exit.
- **Administrator:** Manages the sample network and fare rules and reviews tickets and validation events.

## Approved Lightweight Stack

- **Frontend:** Plain HTML5, CSS3 (modern responsive design, transit design system), Vanilla browser JavaScript. No React, Vite, or frontend frameworks.
- **Backend:** Node.js and Express REST API served from a single origin.
- **Database:** Local SQLite database file via `better-sqlite3`. No external database server or ORM.
- **Cryptographic security:** Node.js built-in `crypto` for HMAC-SHA256 token signing and secure nonce/access token generation.
- **QR generation & scanning:** `qrcode` library for rendering tickets; `html5-qrcode` library for camera scanning with manual text token fallback.
- **Testing:** Node.js built-in test runner (`node:test`).

## Proposed MVP

1. Use a sample synthetic metro network with two lines (Blue Line, Red Line), six stations per line, and one shared interchange station, stored in local SQLite.
2. Let a passenger choose active origin and destination stations.
3. Find a route using a station-and-line graph supporting both Fastest-route (with a 5-minute interchange penalty) and Fewest-interchanges modes.
4. Show ordered stations, line segments, stop count, interchange stations, total minutes, and total distance.
5. Calculate fares on the server using confirmed distance slabs (₹10 for 0 to <2 km, ₹20 for 2 to <5 km, ₹30 for 5 to <12 km, ₹40 for 12+ km).
6. Simulate payment without collecting real payment credentials ("Demo payment — no real money").
7. On successful simulated payment, create one ticket with a compact QR token containing ticket ID, nonce, and expiry, authenticated with HMAC-SHA256. Ticket expires after 120 minutes if unused.
8. Provide entry and exit gate-simulator modes that call the validation API. Entry requires ticket origin. Exit allows ticket destination or intermediate stations on the selected route if within the paid fare slab.
9. Provide an administrator dashboard for stations, connections, fare rules, ticket auditing, and validation events.

## Explicit exclusions for the default version

- Real operator, timetable, or physical gate integration.
- Real payment processing or storage of payment credentials.
- Claims that the demo is a production-ready metro ticket.
- Third-party cloud databases, external map services, or AI APIs.

## Proposed success measures

- A passenger can complete the full demo journey from station selection to a QR ticket.
- The server calculates and stores the correct route and fare for the selected trip.
- Repeating an order/payment request with the same idempotency key does not create duplicate tickets.
- A valid ticket can enter once at origin and exit once at destination or valid intermediate station; invalid, expired, replayed, or out-of-slab scans are rejected with a clear result.
- The gate simulator works with camera scanning (with user permission) and manual token input.
- The website is responsive, accessible, aesthetically polished, and fully functional on mobile and desktop screens.

## Resolved decisions

1. **Network:** Two synthetic lines (Blue Line: B1-B6, Red Line: R1-R6) intersecting at Central Junction (B4 / R3).
2. **Fare slabs:** [0, 2 km) -> ₹10; [2, 5 km) -> ₹20; [5, 12 km) -> ₹30; [12 km, inf) -> ₹40.
3. **Exit station rule:** Allowed at ticket destination or an intermediate station on the route provided the distance traveled fits within the paid fare slab. Exits beyond destination or beyond paid slab are rejected.
4. **Passenger access:** Guest ticket lookup using an unguessable secure random access token. Single passenger per order.
5. **Stack:** Node.js, Express, SQLite (`better-sqlite3`), vanilla HTML/CSS/JS, `qrcode`, `html5-qrcode`.
6. **QR scanner:** Camera scanning via `html5-qrcode` with manual fallback.

