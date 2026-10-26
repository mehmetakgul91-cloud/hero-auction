# Five cosmetic arena scenes — local, not published

Base: `mehmetakgul91-cloud/hero-auction` main
`da0688e4a42d5b5f389a2969ec7a800775874480` (26 October 2026).

## Scenes

- `courtyard`: Chinese-inspired stone courtyard, tiled eaves and octagonal paving.
- `savanna`: African savanna-inspired earth, acacia silhouettes and dry grasses.
- `fjord`: Viking-inspired basalt, fjord silhouettes and braided edge details.
- `ruins`: forest ruins, broken masonry, moss and vines.
- `space`: starfield perimeter and a static metallic platform.

Each scene is a self-contained local SVG under 4 KB. There are no fetched image
providers, animated starfields, WebGL, canvas, filters, new loops, or audio changes.
The central play area stays quiet. Blue/red washes are confined to subtle edges;
existing team labels and left/right positions remain, with solid/dashed borders
as another non-colour cue. The accepted light shell remains unchanged.

## Match identity and stability

The server creates `arenaPresentation: {version:1, matchKey, theme}` when a room
is created. `matchKey` is the existing public room code, match number and creation
time. The draw uses Node `crypto.randomInt`, independently of combat seeds and
PRNGs. First matches choose among five scenes; rematches choose among the other
four so the immediately previous scene does not repeat. New unrelated rooms do
not share a theme history.

The metadata is serialized with the existing room JSON, returned identically to
both seats, and included in preparation/initial battle responses. It is not
reversed when combat teams are oriented for the second player. There is no
schema migration or production database operation. Legacy room records without
valid metadata use a deterministic hash of their existing match key and are not
silently rewritten. Real PostgreSQL restart verification was not run; JSON
round-trip stability and the existing persistence path were checked.

The client accepts only the five whitelisted IDs and matching version/current
validated room identity. It binds once per match to `#battle-arena` using only
`data-arena-theme` and an accessible label. Repeated snapshots, lane edits,
orientation changes, focus changes, or duplicate responses cannot reroll it.
Unknown/injected URLs and mismatched metadata never become CSS or DOM markup.
The standalone non-account preview uses its existing stable preview key.

## Scope and verification

No hero artwork, role/formation geometry, targeting, HP/shield values, attack
rules, timers, commander effects, music, economy, ad flags, or authentication
rules changed. Existing mobile scroll, overflow and 44 px control rules remain.
Web, bot, matchmaking and CrazyGames use the shared implementation. Original
styles remain in place; only the accepted theme's decorative arena rules change.

Checks and their exact logs are in the delivery archive:

- Full README regression: **1,640 / 1,640 passed**, zero failed/skipped.
  Command: `node --test *.test.js tests/*.test.* test/*.test.js`.
- Focused scene/selection/HTTP, current theme, mobile viewport/scroll, renderer,
  music and commander-control tests: **59 / 59 passed**.
- Strict roster audit: 50/50 heroes have images, abilities and reviewed power.
- Five SVGs parsed and rendered with Inkscape; source artwork visually inspected.
- Static central-artwork text contrast: minimum 5.78:1 (not a measurement of a
  fully composed browser screen); representative CSS text pairs pass AA.
- Preview source runtime: five themes × four viewport choices × two valid
  formations = 40 states, with ten hero cards, HP bars and shield meters each.
- JavaScript syntax, CSS parsing and `git diff --check`.

**Verification boundary:** browser layout/touch screenshots were not obtained.
Local Chromium had previously been denied and cloud browser local/file/data
preview routes are not available; no bypass, CSS injection into production,
public rehosting, account creation or live gameplay was used. The HTML review
uses original production HTML/CSS and the actual card renderer with clearly
labelled sample values; it is not a screenshot or full runtime QA claim.

The first aggregate test attempt lost a dependency symlink to another worktree;
the isolated checkout now owns its copied dependencies. The subsequent run found
three source-extraction test fixtures needing the new cosmetic helper/context.
Those fixtures retain their gameplay assertions and now additionally check shared
presentation metadata. The final aggregate results supersede those attempts.

## Preview and rollback

`Hero-Auction-Bes-Arena-Temasi-Onizleme.html` is a self-contained offline review.
It makes no network requests, cannot start a real game, and exposes only theme,
viewport and sample-formation selectors. All actual game controls are disabled.

The archive includes exact original files from main `da0688e4` plus the patch,
new source/tests, preview builder and final evidence. It is a scoped source/theme
backup, not a database or complete media backup. Never restore the entire repo
or remove newer independent work. To reverse this change, check and reverse
its patch or revert its local implementation commit through normal review.
No push, pull request, merge, deployment, feature activation or database migration
has been performed as part of this preparation.
