# Auction and arena reactions

Six approved original faces: laugh, slow clap, fake crying, yawn, sunglasses,
and tongue-out `nanik`. No chicken, commander portraits, or free-text arena chat.

## Interaction

- In the auction, a 44-pixel picker control sits inside the local player's
  commander heading alongside its portrait and player name. At standard widths
  the shared heading is 51 pixels high, with small mobile growth allowed when
  the self label wraps beside a real scrollbar. Both reactions overlay their existing player-card content
  below the respective heading, without reserving space for artwork.
- In the live arena, a compact picker uses the navigation row. The two reactions
  overlay the battlefield's upper left and right corners, outside the score,
  navigation and ability controls. Neither screen changes layout when reactions
  appear or expire, and the artwork cannot intercept clicks or touches. Mobile home navigation
  retains its accessible label in a compact icon, and the friend action stays
  on one line. The user-open picker closes on selection, outside press or Escape.
- Each reaction lasts at most 5 seconds. The server enforces five seconds
  between sends per participant, shared across auction/preparation/arena.
- Opponent reactions can be hidden; the preference follows the browser between
  both screens. Muting clears the visible opponent reaction immediately.
- Reduced motion uses still artwork. Hidden tabs, finished matches, navigation,
  account changes, and safety restrictions remove reactions instead of queuing
  a replay. Initial snapshots do not replay earlier reactions.

## Compact auction presentation

The auction-only density stylesheet loads after the shared theme on both the
normal and CrazyGames entry surfaces. Acquired cards use compact portrait/name,
role, rarity border and cost rows. Portraits resolve from the production public
team's name and universe through `/api/art`; IDs and direct portrait URLs are
not required in room snapshots. In-flight and settled requests are cached across
player-panel repaints. Detached prior nodes cannot receive late artwork, and
missing or failed art keeps the card's name and price readable without a broken
image. Unavailable metadata is cached for the page session rather than retried
on every four-second room poll.

The real active/passive ability explanations stay visible across the full width
below the art and bidding composition; lane bonuses wrap at 11 pixels. No story
section is added. Waiting, preparation and finished side-card markup retain
their previous form. Budget controls are not replaced for presence/chat updates.

At 390×844 the ten-card stress fixture fits without scrolling; at 320×740 it
uses natural page scrolling. Empty teams do not reserve a 132-pixel blank area.
Their transient reactions can extend into noninteractive chat heading/history,
but must never obscure bid, commander, picker or chat composer controls. Layout
must remain identical before, during and after reactions.

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
preserving all original expressions and frames. They were not regenerated.
The first five source sprite sheets were unavailable, so the approved dark
blue background is intentionally retained as part of each compact reaction
tile, rather than pretending these are transparent cutouts. Each is encoded
as a one-shot animated WebP (under 150 KB) with a PNG still fallback. The
on-screen image is 132×132 pixels (three times the original 44-pixel size);
picker stills remain 48 pixels and the trigger remains a 44-pixel touch target.
Only WebP frame-duration metadata was stretched to five seconds; all compressed
pixel data, frame order, artwork and the one-shot loop count are unchanged.

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
Auction fixtures use only production public-room card metadata, with both empty
and ten-card teams. They check real loaded art, name/price separation, full-width
abilities, 390-pixel fit, composer safety and unchanged selected bids after
repainting. Unit seams separately verify portrait errors, stale/disconnected
nodes, auction-only markup and shared normal/CrazyGames stylesheet delivery.
The local execution environment could not launch Chromium because its IPC
socket operation was restricted; do not treat local unit/HTTP passes as visual
verification. Run browser CI against the exact release commit before deployment.
