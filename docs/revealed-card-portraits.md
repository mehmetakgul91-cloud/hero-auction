# Revealed-card delivery portraits

The two dashed receiver boxes during the final auction reveal now retain one
portrait per already-revealed team card, rather than replacing the previous
receipt with the latest card name. Previously revealed acquisitions are included;
pending tail cards are excluded until arrival or explicit “Show all”. No empty
card slots are rendered. Reveal order is retained, including after reconnect.

The existing `/api/art` lookup supplies the same artwork as the main reveal.
Names remain available through image alt text and hover titles; if artwork is
unavailable, that card's name remains as a fallback. Portrait requests are cached
within the reveal sequence, and disconnected old nodes cannot repaint a new view.
No authoritative teams, credits, reveal timing, server logic or native code change.

## Verification

- `npm test`: 2503 passed, 0 failed, 0 skipped (Node 24.22.1 in this executor;
  package declares 26.12.1, so the configured CI runtime remains a separate check).
- Focused portrait + reveal/lifecycle/state tests: 74 passed.
- `npm run audit:strict`: 50/50 active heroes have art; no problems.
- `node --check public/app.js` and `git diff --check`: passed.
- Local browser visual execution is not claimed: this executor's browser launch
  route was previously denied, and that route was not retried for this change.

## Pending visual check

Run `node tools/build-delivery-portraits-preview.mjs /tmp/delivery-portraits.html`
to create a self-contained, no-network preview using the actual renderer, CSS
and existing roster artwork. Preview generation was verified. It does not
exercise the full application lifecycle; those flows are covered by unit tests.

In an allowed browser, check 320px, 390px and desktop widths: buttons for 0, 1,
3 and 5 must show exactly that count per receiver; repeated “Reveal next” caps
at five; Reset/rematch clears every portrait. Inspect recognizability and cropping
at 320px, where five portraits shrink to fit the existing bottom box. Also check
the real game flow through arrivals, Show all, background/resume and rematch.
