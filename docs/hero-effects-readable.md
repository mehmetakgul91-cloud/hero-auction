# Readable hero attacks (local revision, not published)

Based on main `49373c1ca65a1a3dd3c7332a21b2d4cdca5dfa91`.

## Why the previous effects were missed

The default 850ms selection became 612ms through a `.72` multiplier.
Preparation was only 73ms, travel208ms, and impact330ms. Specials used the same
short timing. Catch-up playback could start another cast every220ms.

## Presentation

Default normal:240ms preparation +360ms travel +800ms impact =1400ms.
Default special:360ms preparation +480ms travel +1060ms impact =1900ms.
The source/travel remains deliberate and readable. The revised damaging contact
uses narrow, unfilled SVG strokes: one directional sweep fades before68% of the
impact phase, then small fragments carry the remaining tail. No filled X/rune/bolt
remains across the face. Distinct strokes retain the roster identities. Melee steps forward without hiding
the enemy portrait; ranged heroes remain stationary. Splash impacts share the
special arrival. Self effects and already-lethal committed hits have no fictional
travel. HP, defeat, shield and damage labels remain immediate server snapshots.

There is no unbounded effect backlog: four whole active casts maximum,32 targets
per defensive cosmetic group, no deferred cosmetic timers outside owned cleanup.
A newer death, revival or removed card cancels stale decoration. Background,
route/reset, connection loss and reduced motion clear resources. Victory keeps
its existing final-hit window and clears any late tail.

## Authoritative battle pace

New live matches opt into `readablePacing:true` in server.js. Legacy explicit
lifecycle callers remain900ms. The server, not either client, chooses1400ms after
normal actions and1900ms after special actions; a50ms scheduler checks deadlines
without rounding them to old900ms ticks. Both seats see the same committed state.
Replay uses the same shared action timing. Live presentation uses full cast beats;
a reconnect/terminal snapshot retains only the newest complete historical cast,
not seconds of obsolete hits over current HP.

A match-owned tactical clock advances900 combat-ms over each new presentation
beat. Normal commander cooldown remains5000 tactical-ms and the shared gate
remains1200 tactical-ms plus a1200 real-ms visual minimum. Bot reaction uses this
same combat clock. This prevents a slower hero pace granting extra casts per
round. Returned cooldown estimates are mapped to real milliseconds and refreshed
with snapshots; the label notes adjustment to battle pace. The estimate can
change when the next beat changes from normal to special.

Round-based energy, buffs/debuffs, targeting, damage, RNG, HP/shield, settlement,
room/session expiry and network timeout clocks are not modified. No new database
migration or external environment change is required. Existing process-owned
live matches cannot be hot-switched by this code; rollout/restart policy is a
separate publication decision.

## Deterministic measurement (not a typical-match prediction)

The actual basic combat fixture:30 hero actions,44 total scheduler steps,6
scripted commander casts:39.6s baseline versus61.6s readable (+55.6%).
The actual parity-engine fixture:30 hero actions including10 specials,44 scheduler
steps,6 scripted commander casts:39.6s versus66.1s (+66.9%).
At matched tactical boundaries, full event traces, HP, energy, cast eligibility
and winner match. The test controls critical rolls; production RNG is unchanged.
These are injected-clock measured fixtures, not stopwatch measurements of live
network games. Real duration depends on roster, deaths, decisions and latency.

## Target-contact revision after preview feedback

The first preview held a portrait-sized glyph too long; actual screenshots showed
a large X covering the victim and a thick yellow target-card box. Damaging impacts
now use attack-specific open strokes (slash, staggered dagger cuts, hammer contact,
arrow splinters, energy wisps, narrow lightning forks, light rays), with4 normal
or6 special fragments. Thin dark edges retain contrast on bright portraits. The
large target-card selection box is removed; HP/name layout is untouched. Healing
and shielding keep their original restoration/protection appearance.

The local controlled vector geometry study is separate from browser evidence. It
is not an animation recording. New live browser QA is required after previewing
the revised head; earlier screenshots only establish the rejected before-state.

## Remaining acceptance gate

Timed browser/video proof has NOT been obtained. Browser DevTools and CLI Chromium
were blocked previously; the browser host cannot reach this workspace localhost.
No denied route was retried. Functional tests and DOM presence are not visual
acceptance. A separately authorized browser-reachable preview must be inspected
at normal/special preparation, travel and impact timestamps on mobile and desktop
before declaring the aesthetic result accepted. The latest authorization covers updating the existing draft PR73 and preview
for revised motion QA. Production merge/release remains gated by final review.


### Natural-size contrast correction

The first contact-only preview removed face occlusion, but actual ~65px normal
fighter/mage frames were too subtle on golden/busy portraits. The focused follow-up
keeps the same open geometry and bounds, uses an8/9-unit dark edge,5/6-unit colored
stroke and2.4/2.8-unit white core, and keeps the moving cut readable through52% of
its phase before fading by68%. Fragments are2.6/3 units rather than subpixel at
natural size. This does not restore a filled glyph, card box, or longer battle beat.
