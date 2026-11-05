# Auction and arena reactions

Six approved original faces: laugh, slow clap, fake crying, yawn, sunglasses,
and tongue-out `nanik`. No chicken, commander portraits, or free-text arena chat.

## Interaction

- In the auction, the picker and own reaction sit inside the local player's
  commander heading; incoming reactions sit in the opposing commander heading.
- In the live arena, a compact picker and the two reactions use the navigation
  row, outside HP, hero portraits and ability controls. Mobile home navigation
  retains its accessible label in a compact icon, and the friend action stays
  on one line. The user-open picker closes on selection, outside press or Escape.
- Each reaction lasts at most 2.8 seconds. The server enforces five seconds
  between sends per participant, shared across auction/preparation/arena.
- Opponent reactions can be hidden; the preference follows the browser between
  both screens. Muting clears the visible opponent reaction immediately.
- Reduced motion uses still artwork. Hidden tabs, finished matches, navigation,
  account changes, and safety restrictions remove reactions instead of queuing
  a replay. Initial snapshots do not replay earlier reactions.

## Transport and safety

`POST /api/arena-emotes` accepts exactly `code`, `token`, `matchKey`, `emoteId`
and `requestId`. The room bearer token uses the same participant authorization
convention as the existing live-arena API. The server supplies sender side,
event ID, timestamp and expiry. Unknown IDs, sender claims, text, URLs, stale
matches, spectator/invalid seats and oversized payloads are rejected.

The service is process-local and bounded: two live events and up to 256 retry
receipts per participant/match. Idempotent retries neither rebroadcast nor
restart the cooldown. It never writes to room persistence, auction decisions,
HP, energy, abilities, outcomes, activity or presence. Restarting the process
discards reactions. No migration or economy configuration is required.

Auction delivery uses a named `arena-emotes` event on the existing authenticated
SSE connection. It does not repaint the auction or move the bid input. Existing
room-state polling is a fallback; disconnected clients may miss short-lived
reactions by design. Live arena delivery uses the existing commander polling.
Snapshots are receiver-relative: side 0 is self, side 1 is the opponent.

Existing block, moderation availability, account suspension and platform
restrictions apply. Bot matches and the communication-disabled CrazyGames
launch do not expose reactions. Preparation, waiting and finished matches are
disabled. The same match's cooldown survives the preparation transition.

## Artwork

The six 188×188 animations were cropped from the approved revised preview,
preserving all original expressions and timing. They were not regenerated.
The first five source sprite sheets were unavailable, so the approved dark
blue background is intentionally retained as part of each compact reaction
tile, rather than pretending these are transparent cutouts. Each is encoded
as a one-shot animated WebP (under 150 KB) with a PNG still fallback. The
on-screen image is 44 pixels; picker stills are 48 pixels.

Animated URLs include the server event ID to restart a repeated one-shot
reaction reliably. Every path is selected from the fixed local allowlist.
There is no user-provided image URL or remote image service.

## Checks

- `npm test`
- `npm run audit:strict`
- `node tools/test-arena-emotes-browser.mjs` with Playwright/Chromium installed
- `.github/workflows/arena-emotes-browser.yml` runs real browser fixtures on CI.

Client, service and real-HTTP tests cover duplication, cooldown, expiry,
moderation, platform rules, auction-to-arena continuity, stale responses,
rematches, cross-tab logout, reduced motion and cleanup. Browser checks cover
the real frontend modules, mobile/landscape geometry and unchanged bid controls.
The local execution environment could not launch Chromium because its IPC
socket operation was restricted; do not treat local unit/HTTP passes as visual
verification. Run browser CI against the exact release commit before deployment.
