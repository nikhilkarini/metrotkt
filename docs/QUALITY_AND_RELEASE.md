# Quality and Release Plan

## Verification approach

Map each Must requirement in `REQUIREMENTS.md` to an automated test using Node.js built-in test runner (`node:test`) or a recorded manual check. Do not report a check as passed unless it was run and the real result inspected.

## Test layers

### Automated checks (`node --test`)

- **Route search:** Fastest path, transfer penalties, fewest-interchange mode, closed stations, same-station error, disconnected network.
- **Fare calculation:** Slab boundaries ([0, 2) km -> ₹10, [2, 5) km -> ₹20, [5, 12) km -> ₹30, 12+ km -> ₹40), zero/negative distance rejection.
- **Token service:** HMAC-SHA256 signing and verification, payload integrity, expired tokens, tampering detection.
- **Ticket lifecycle & state transitions:** `ACTIVE -> IN_TRIP -> USED`, rejection of duplicate entry, rejection of duplicate exit, rejection of invalid station.
- **Order & payment:** Idempotency key deduplication (identical repeated requests return existing order/ticket without duplicate records), simulated payment failure creates no ticket.
- **Gate validation rules:** Entry origin check, exit destination check, exit at intermediate station within paid slab, exit rejection when station is beyond paid slab.

### End-to-end and manual checks

- Complete passenger journey: station selection -> route quote -> demo payment -> QR ticket display -> entry scan -> exit scan.
- Payment failure option handled with friendly retry.
- Gate simulator with camera scan (`html5-qrcode`) and manual fallback token input.
- Responsive mobile & desktop layouts with accessible markup and clear contrast.

## Demo runbook

- Local URL: `http://localhost:3000`
- Demo administrator credentials: configured via `.env` (default password: `adminpassword123`)
- Seed network: 2 lines (Blue Line, Red Line), 6 stations each, 1 interchange at Central Junction (B4 / R3).
- Automated test command: `npm test`
- Startup command: `npm start`

