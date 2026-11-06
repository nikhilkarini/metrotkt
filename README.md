# 🚇 Metro Automatic Fare Collection (AFC) Ticket Generator

An educational college-project web simulation demonstrating the complete journey of a metro Automatic Fare Collection system:

**Station Selection ➔ Route & Fare Calculation ➔ Demo Payment ➔ HMAC-SHA256 Signed QR Ticket ➔ Gate Turnstile Entry & Exit Validation ➔ Admin Operations Console**

---

## 🌟 Highlights & Features

- **Lightweight Zero-Cloud Architecture:** Pure local setup. No third-party API keys, no external cloud databases, no Docker, and no external payment services.
- **Pure Web Stack:** Plain HTML5, CSS3, and browser JavaScript frontend; Node.js and Express backend on a single origin.
- **Embedded Relational Storage:** Local SQLite database file powered by `better-sqlite3` with Write-Ahead Logging (WAL) enabled.
- **Stateful Dijkstra Routing:** In-memory network graph supporting:
  - **Fastest Route:** Minimizes travel minutes with a configurable 5-minute interchange transfer penalty.
  - **Fewest Interchanges:** Minimizes line changes first, then running time.
- **Distance-Based Fare Slabs:** Pure server-enforced fare function (₹10 / ₹20 / ₹30 / ₹40).
- **Idempotent Demo Orders:** Prevents duplicate orders or ticket creation on network retries.
- **Cryptographic Security:** Built-in Node.js `crypto` HMAC-SHA256 signed QR tokens containing strictly `ticketId`, `nonce`, and `expiry` — zero personal or fare data leaked in the QR payload.
- **Atomic Gate Turnstile Simulation:** Supports both camera QR scanning (via `html5-qrcode` with user permission) and manual text token entry. Atomic state machine (`ACTIVE ➔ IN_TRIP ➔ USED`) prevents duplicate/replayed scans.
- **Intermediate Station Exit Rule:** Allows exit at destination or any intermediate station along the booked route as long as the traveled distance fits within the paid fare slab.
- **Protected Admin Console:** Real-time station active/closed toggling, connection management, fare slab viewing, and validation event auditing.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript | Responsive transit design system with interactive SVG metro line diagram |
| **Backend** | Node.js & Express | Monolithic REST API served from a single origin |
| **Database** | SQLite via `better-sqlite3` | Local file `metro_afc.db` storing stations, connections, orders, tickets, and events |
| **QR Code** | `qrcode` & `html5-qrcode` | Server-side QR image rendering & client turnstile camera scanning |
| **Cryptography** | Node.js built-in `crypto` | HMAC-SHA256 token authentication & secure random nonces |
| **Testing** | Node.js built-in runner (`node:test`) | 33 comprehensive unit and integration tests |

---

## 🗺️ Synthetic Metro Network

The network consists of two lines intersecting at a shared interchange station:

- **Blue Line (Line 1 - Sky Blue `#0284c7`):**
  - `B1` Bayview (Terminal)
  - `B2` Harbor Point (2.5 km from B1, 4.0 min)
  - `B3` Tech Park (3.2 km from B2, 5.0 min)
  - `CJ` Central Junction (2.1 km from B3, 3.5 min) — *Shared Interchange*
  - `B5` Market Square (1.8 km from CJ, 3.0 min)
  - `B6` Sunrise Hills (3.5 km from B5, 5.5 min) — *Terminal*
- **Red Line (Line 2 - Crimson Red `#ef4444`):**
  - `R1` Airport City (Terminal)
  - `R2` Aero Club (4.0 km from R1, 6.0 min)
  - `CJ` Central Junction (3.0 km from R2, 4.5 min) — *Shared Interchange*
  - `R4` Grand University (2.4 km from CJ, 3.5 min)
  - `R5` Green Meadows (2.8 km from R4, 4.0 min)
  - `R6` South Park (3.3 km from R5, 5.0 min) — *Terminal*

---

## 💰 Fare Slab Rules

Fares are calculated strictly on the server based on total route distance (in Indian Rupees):

| Distance Slab | Fare (INR) |
|---|---|
| **0 to < 2 km** | ₹10 |
| **2 to < 5 km** | ₹20 |
| **5 to < 12 km** | ₹30 |
| **12 km or more** | ₹40 |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js (v18 or higher; tested on Node.js v24)
- npm (v9 or higher)

### 2. Installation
Open the project directory and install dependencies:
```bash
npm install
```

### 3. Configuration
The project comes pre-configured with `.env` and `.env.example`:
```ini
PORT=3000
HMAC_SECRET=metro_afc_secure_local_secret_key_892347
ADMIN_PASSWORD=adminpassword123
DATABASE_FILE=metro_afc.db
TRANSFER_PENALTY_MINUTES=5
```

### 4. Running the Website
Start the web application:
```bash
npm start
```
Or with auto-reload watch mode during development:
```bash
npm run dev
```

Open your browser at:
👉 **`http://localhost:3000`**

### 5. Running Automated Tests
Run the test suite using Node's built-in test runner:
```bash
npm test
```
*Executes all 33 unit and integration tests covering Dijkstra search, transfer penalties, fare boundaries, HMAC signing/tampering, payment idempotency, and gate turnstile state transitions.*

---

## 🚶 Step-by-Step Demo Walkthrough

### 1. Plan a Trip
1. Navigate to the **Plan Trip** tab.
2. Click directly on stations in the interactive SVG metro map (e.g. click **Bayview (B1)**, then click **Central Junction (CJ)**).
3. Select your route optimization preference:
   - **⚡ Fastest Route:** Applies a 5-minute penalty for line changes.
   - **🔄 Fewest Transfers:** Prioritizes journeys with the minimum number of interchanges.
4. Click **Calculate Route & Fare** to view the ordered stations, distance, travel time, and fare slab breakdown.

### 2. Demo Checkout & Simulated Payment
1. Click **Proceed to Demo Payment**.
2. Notice the prominent **"DEMO PAYMENT — NO REAL MONEY"** notice.
3. Click **Simulate Payment (Success)**.
4. The server atomically marks the order paid and issues an HMAC-SHA256 authenticated ticket with an unguessable guest access token.
5. *(Optional test)* Click **Simulate Payment (Failure)** to observe friendly failure handling with retry options.

### 3. Inspect Your QR e-Ticket
1. The **My Ticket** screen displays the high-contrast QR code, ticket reference (e.g. `TKT-...`), journey path, issue time, and 120-minute expiry.
2. Click **Test in Gate Simulator** or **Copy Signed QR Token String**.

### 4. Gate Turnstile Simulation
1. Switch to the **Gate Simulator** tab.
2. Choose **🟢 ENTRY GATE** mode and set the turnstile location to your ticket's origin (e.g. **Bayview**).
3. Click **Scan & Validate** (or click **Start Camera Scanner** to use your device webcam after granting permission).
4. The turnstile will transition to **ACCESS GRANTED • GATE OPEN (🟢)** and the ticket moves from `ACTIVE` to `IN_TRIP`.
5. *(Security test)* Click **Scan & Validate** again: the turnstile rejects the scan as **Duplicate Entry**.
6. Switch to **🔴 EXIT GATE** mode and choose your destination (e.g. **Central Junction**).
7. Validate: the turnstile grants exit and transitions the ticket to `USED`.
8. *(Replay test)* Attempt to exit again: the gate rejects the scan as **Ticket already used**.

### 5. Intermediate Exit Verification
- Buy a ticket covering a longer distance (e.g. B1 Bayview to B6 Sunrise Hills, 13.1 km, ₹40 paid).
- Enter at B1 Bayview.
- Attempt an early exit at B2 Harbor Point (2.5 km). Since ₹40 paid >= ₹20 slab for 2.5 km, early exit is approved!
- Now buy a ticket for B1 Bayview to B2 Harbor Point (2.5 km, ₹20 paid). Enter at B1 and attempt to exit at B5 Market Square (9.6 km, which costs ₹30). The gate simulator rejects the exit because traveled distance exceeds the paid slab!

### 6. Administration Console
1. Switch to the **Admin** tab.
2. Enter the default administrator password: `adminpassword123`.
3. View the system metrics (total tickets, orders, validation events).
4. Toggle a station state from **ACTIVE** to **CLOSED** (e.g., close **Tech Park (B3)**).
5. Return to the journey planner: observe how Dijkstra immediately avoids the closed station or alerts that no route is possible!

---

## 🔒 Security Design

1. **HMAC-SHA256 Token Signing:**
   - Payload format: `{ "tid": "...", "nonce": "...", "exp": 1234567890 }`.
   - Secret key stored strictly server-side in `.env` (never shipped to browser JavaScript).
   - Any tampering with the payload or signature is rejected instantly using constant-time comparison (`crypto.timingSafeEqual`).
2. **Server-Side Price Recalculation:**
   - The browser never determines ticket prices. Order creation recalculates distance and fare slabs directly on the server.
3. **Idempotency:**
   - Each order requires a unique `idempotencyKey`. Network replays return existing orders without duplicate database inserts.
4. **Audit Logging:**
   - Gate scan attempts (both approved and rejected) are stored in `validation_events` without logging the full reusable QR token.

---

## 📋 Assumptions & Project Defaults

- **Single Passenger:** Standard single journey tickets are issued for one passenger per order.
- **Offline Simulation:** No external networks, real banks, or cloud hosts are called.
- **In-Trip Validity:** An unused ticket expires 120 minutes after issue. Once entered (`IN_TRIP`), a passenger may complete their trip without an automatic timeout penalty.
- **Browser Camera:** Scanning requires HTTPS or `localhost` context to access webcam streams in modern browsers; manual token entry is always available as fallback.

---

## 🎓 Academic Demonstration Checklist

- [x] Node.js and Express REST backend on single origin
- [x] Local SQLite storage via `better-sqlite3`
- [x] Two lines, six stations each, one shared interchange
- [x] In-memory graph with stateful Dijkstra router
- [x] 5-minute line-change transfer penalty
- [x] ₹10 / ₹20 / ₹30 / ₹40 fare slabs
- [x] Idempotent order & payment simulation
- [x] HMAC-SHA256 signed QR ticket with `qrcode`
- [x] Camera barcode scanning with `html5-qrcode` & manual input fallback
- [x] Atomic gate state transitions (`ACTIVE ➔ IN_TRIP ➔ USED`)
- [x] Protected admin dashboard
- [x] 33 automated tests via `node:test`
