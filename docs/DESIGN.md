# UI and Interaction Design

## Design objective

Make the simulated metro journey easy to understand on a phone: select stations, inspect route and fare, finish a clearly identified demo payment, show the QR ticket, and understand gate-scan results.

## Main navigation

- **Plan a trip** — passenger journey planner with interactive visual metro diagram.
- **My ticket / Find ticket** — guest ticket lookup with QR code display.
- **Gate simulator** — demo entry/exit validation (camera scanner + manual token entry).
- **Admin dashboard** — protected station/connection/fare controls, ticket audit, and validation events.
- **Help / About** — educational simulation guide explaining the project architecture and AFC concepts.

## Screens and required states

### Home and journey planner

Components: origin selector, destination selector, swap action, passenger count, optional route preference, and submit button.

States: loading stations, no active stations, missing selection, identical stations, request failure, and successful quote.

### Route and fare results

Show ordered stations, line segments, stop count, interchanges, estimated minutes, distance, and fare breakdown. If multiple routes are available, state how they are ranked. Allow the user to return and change stations.

### Demo checkout

Show journey, passenger count, and server-calculated total. Display “Demo payment: no real money.” Use clearly labeled simulated success/failure controls. Do not request real payment credentials.

### Ticket page

Show QR, ticket reference, origin/destination, issue and expiry times, and current state. Explain that this is a project demo ticket. Do not display private QR payload fields as if they were user-facing information.

### Gate simulator

Provide Entry and Exit modes, camera scan where supported, and a manual token field for fallback. Show accepted/rejected result, reason, station, time, and next instruction. Avoid exposing secret token contents in logs or error text.

### Admin dashboard

Provide station and fare management, ticket search, validation event history, and simple status counts. Require authenticated admin access and show validation for destructive or consequential changes.

## Interaction and accessibility requirements

- Every input has a visible label; errors are associated with the relevant field.
- Core functions work by keyboard and have visible focus indicators.
- Do not use color alone to convey active, failed, or used ticket state; pair color with text/icon.
- Use responsive layouts and readable contrast at phone widths.
- Provide loading, empty, success, and error states for all network-driven screens.
- Confirm admin changes and show a clear result after save.
- Use a persistent demo label on payment and ticket screens.

## Visual direction

Use a clean transit-inspired interface with a strong route hierarchy, legible station/line labels, and restrained line colors. Choose exact typography, colors, spacing, and icon style during implementation and document them as design tokens once approved. Avoid imitating an operator’s official branding unless authorized.
