# Arena lanes, auction entry, chat composer and wallet values — 26 October 2026

Local UI patch, based on carrier `31522f4ef70a94d21967312c560fd3bb9d2815af`,
whose tree `a934dfb9659fa89a1a8f11b41d1b63afa9960d89` exactly matches live merge
`80f266ba45c88f7d91dce50f25542a46ac33db80`. Maintenance/recovery code is preserved.
No server, balance, formation, front/back bonus, wallet or reward rules change.

## Changes

- Arena: each front/back lane independently occupies equal vertical slices of
  its area. One hero is exactly centred; 2–5 heroes are equally spaced without
  vacant fixed slots. A shared 60-track grid divides exactly by each count.
  Team orientation and roster order do not change. Defeated heroes keep their
  position, so attacks and revivals never jump between targets.
- Auction: initial entry, invitations/restores and rematches return to the top
  after the card markup exists. Same-match polling, chat, bids, next cards and
  SSE reconnects do not reset scroll or steal focus. Hidden lobby input focus is
  released on entry, not a visible chat input.
- Chat: a content-width send button leaves a usable input at narrow widths;
  a native form supports keyboard/mobile submission. IME confirmation does not
  send. The input node survives snapshots; a newly typed draft is not erased by
  an older send response. Errors preserve text. Old room/account/rematch replies
  cannot update the current room. Platform/bot restrictions remain enforced.
  The log also refreshes at the server's 60-message cap, where count-only checks
  previously stopped displaying new messages. Reading the log no longer opens
  the keyboard through whole-panel click delegation.

- Wallet: gold, magic dust and diamonds never break a numeric value across lines.
  Each number gets its currency cell's full width, separately from icon/label.
  Values longer than six formatted characters use a full-width wallet row; every
  digit and the full accessible label/title remain intact, including 2,147,483,647.
  No abbreviations, clipped numbers or inferred balances are used.
- Tutorial copy: the hard-coded 120-gold prize badge now follows actual server
  capability. Enabled chests show the guaranteed gold options and conditional
  dust/diamond contents. Explicit flags-OFF legacy messages remain accurate.

## Validation

- `node --test *.test.js tests/*.test.* test/*.test.js`: **1940 passed, 0 failed, 0 skipped** (includes isolated local-server integration tests).
- `npm run audit:strict`: 50/50 active heroes have artwork, abilities and reviewed
  power; no problems.
- Changed JS syntax checks and `git diff --check`: passed.
- All 36 legal two-team lane splits; front/back orientation; exact centres,
  equal spacing, death/revive stability, persistent portraits/animations.
- Entry lifecycle and composer tests cover 320/390-wide and landscape budgets,
  reconnect, repeat renders, IME, Enter, pending drafts, errors, room/account
  switch, rematch, teardown, bot/platform restrictions and log scrolling.
- Real standalone HTTP server: both web and CrazyGames entrypoints/modules
  served; local synthetic player A submits through the actual composer module,
  player B reads the message, reload retains history, invalid send retains draft.
  No real account, external room or unsolicited message was used.

## Visual verification limit

The actual user screenshots (`IMG_1176.jpeg`, `IMG_1174.png`, `IMG_1178.jpeg`) were materialized
from Library and inspected before implementation. Local Chromium rendering was
previously refused by sandbox/socket/bwrap restrictions; this patch did not retry,
change executors, proxy or work around that refusal. Responsive checks above are
logic/CSS and DOM-model checks, **not a real browser or iPhone visual pass**.
No fabricated browser screenshot is included. Real-device visual/touch QA remains
before claiming those surfaces visually verified.

## Integration

The critical economy release is already live. Apply this UI-only patch to its
matching tree in an isolated integration branch and rerun the aggregate checks. No push, PR, merge, deployment,
production flag, schema or account change is part of this local patch.
