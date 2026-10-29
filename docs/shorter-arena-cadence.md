# Shorter arena cadence (local candidate, not published)

User requested a shorter battle after the readable effects were released; the
proposal was approximately 20% shorter while retaining visible effects and
combat balance. Based on the exact released tree
`ca30cb0d4eb2479f31bd9324fe5181da133a54f3` (main release
`7f460725f88817d2e40eb55abfcfc297647549b5`, identical local base `44ab2ac`).

## Timing contract

- Normal authoritative/playback cadence: **1400 → 1100ms** (21.43% shorter).
- Special authoritative/playback cadence: **1900 → 1500ms** (21.05% shorter).
- Both are exact multiples of the existing 50ms server scheduler. No faster
  polling, accumulated fractional deadline or new catch-up queue.
- Full visual timings remain **240+360+800 = 1400ms normal** and
  **360+480+1060 = 1900ms special**. Contact and visible damage remain together
  at **600 / 840ms**. Source movement and approved particle art are unchanged.
- The next preparation can overlap the preceding fading particle tail, instead
  of waiting for every last spark. For consecutive travelling strikes, the next
  contact is later than the preceding complete impact tail. Self, lethal and
  reduced-motion effects remain immediate as before. Existing cast limits and
  cleanup remain in effect.
- Replay's speed scale still clamps to 0.8–1.15 and uses the same cadence helper.
- Special visual classification now compares the shared `HERO_SPECIAL_MS`
  constant rather than the previous literal 1900. Otherwise changing pace would
  silently turn special visuals into normal ones.
- Tactical time still advances 900 combat-ms per beat. Commander cooldown,
  shared tactical lock, bot eligibility and round energy retain their rules.
  The 1200ms commander cinematic floor is unchanged. Cooldown display estimates
  map to the shorter real intervals.

No modifications to damage, targeting, RNG, roster, HP, death, bot payment,
settlement, rewards, database, room expiry or native source. Previously deferred
social projection changes are not included. No migration is needed. This is not
a hot switch of already-running production rooms.

## Measurement

These are injected-clock deterministic actual-engine fixtures, not live-match
stopwatch measurements or predictions for all teams. Both have 30 hero actions,
44 scheduler steps and six scripted commander casts. The mixed fixture includes
ten specials. Every deadline aligns with a 50ms scheduler boundary.

- Basic: released **61.6s → 48.4s**, 13.2s / **21.43% shorter**.
- Mixed: released **66.1s → 52.0s**, 14.1s / **21.33% shorter**.

Full event traces (excluding wall timestamps), HP, energy, scripted cooldown
eligibility, commander cast count and winner match the same baseline. Earlier
released fixtures also matched that baseline. Production RNG is not replaced.
Real duration still depends on roster, player decisions, deaths and latency.

## Verification boundaries

Local Node 26.12.1 focused tests cover cadence, precise unchanged contact,
special classification, normal/special/ranged movement, consecutive full tails,
bounded cleanup, cancellation, and deterministic gameplay equivalence.
The full aggregate suite and strict roster audit are recorded in the completion
receipt after running against this final candidate.

`tools/test-approved-contact-browser.mjs` additionally asserts the new cadence
and consecutive 1100/1500ms commits with damage at 600/840ms, while retaining
mobile/desktop, route/disconnect, reduced-motion, cleanup and fractional-HP checks.
Its syntax is checked locally. It has **not been run against this candidate**:
previous local browser/socket denial is respected. Run the existing Approved
Contact Browser QA workflow in authorized isolated CI before visual acceptance.

No push, draft PR, merge, production deployment or real-wallet paid match has
been performed for this candidate. Native port must separately adopt cadence
1100/1500ms and keep its current full visual durations and contact boundaries.

Final local verification on 2026-10-29, Node **26.12.1**:
- Aggregate `npm test`: **2610 passed, 0 failed, 0 skipped**.
- Strict roster audit: **50/50, no problems**.
- Focused timing/presentation suite: **28 passed**.
- Browser script syntax and `git diff --check`: passed.
- Candidate browser execution, PostgreSQL end-to-end workflow, physical phone
  and live production gameplay: **not run for this candidate**.
