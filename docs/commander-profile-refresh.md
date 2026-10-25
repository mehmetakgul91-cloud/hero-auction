# Commander development view

The profile is a view of four independent, sequential server-owned branches, not
an unlock/talent tree. Only the explicit next-level button purchases an upgrade.
The second design places the selected commander at the center, with four
connected icon branches around it and one compact upgrade panel below. The
first dashboard/card design was rejected by the user and is not approved for
publication. On 2026-10-25 the user approved publishing V2 and the exponential
gold prices only. Diamond gating, signup gift, exchange and checkout remain OFF;
the draft diamond migrations must not be applied for this release.
The compact path contains the current level, next level and selected milestones;
it does not render 80–100 individually interactive nodes.

- Main branch cap 40; side branch effective cap 20. Saved levels above a side cap
  remain intact and are shown separately as retained levels. Progress never
  exceeds 100% and those levels cannot be purchased again.
- Class preview labels distinguish attack, defense, max-health and their actual
  calculation bases. Normal ability and each independent energy pool are shown
  only when the selected branch is the active commander's main branch.
- Current shared ultimate names, descriptions and archetype-specific costs are
  reused. Only Last Bastion's shield percentage scales; target selection,
  1-health protection, Arcane Surge duration and Revival's 40% remain unchanged.
- Server progression quotes supply gold/diamond prices, affordability and feature
  availability. No payment provider, checkout or sale packages are invented.
- Expected level, commander and request ID are sent for purchases. Repeated clicks
  are locked while pending; a network-uncertain retry retains its request ID and
  attempts to reconcile the saved server profile before another purchase.
- The optional diamond→gold section stays collapsed beneath development. Its
  server-supplied exact quote requires confirmation; transport-uncertain exchanges
  retain their request key even if a subsequent balance refresh shows zero
  diamonds. Feature-off views show unavailable, not a fake balance or checkout.
- A branch selection spends nothing. All touch buttons are at least 44px and
  reduced motion is respected. Skill details are collapsible; upgrading remains
  the primary view.

## Local verification

```sh
node --test *.test.js tests/*.test.* test/*.test.js
npm run audit:strict
node tools/preview-commander-profile.mjs /tmp/commander-upgrade-preview.html
```

The last command produces a standalone offline HTML fixture with the actual view
module and styles, an existing commander portrait, sample account data and no API
calls. It is a preview, not a playable account or a purchase screen. Branches,
TR/EN display and sample levels can be inspected without affecting any account.

Automated coverage checks model/DOM behavior, pricing quotes, both locales,
retained levels, max/insufficient/busy states, no-purchase branch clicks,
repeated clicks, network reconciliation, auth replacement, conversion amount
validation/cancellation/idempotent recovery, and existing
onboarding/invitation flows. It does not substitute for browser visual QA.
The supported remote cloud browser could not access the executor's local server
(`ERR_CONNECTION_REFUSED`). A data-URL attempt was rejected by the browser's
URL security policy; no file, proxy, Chromium or other bypass was attempted.
No browser pixel verification is claimed. DOM tests and code-derived mobile
geometry checks do not replace visual review.
