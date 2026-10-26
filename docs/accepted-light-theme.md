# Accepted warm-gray theme (26 October 2026)

## Status and boundaries

Prepared on local branch `feat/accepted-light-theme-20261026`, from
`cddcf18c89dbca46d98c46cf7bd127ac1192acba` (tree
`2b3513eea822d4673f81781a39c196131ebd1123`). This change does not itself publish,
push, merge, or deploy anything. The existing dark site remains available at that
base commit and local backup branch `backup/dark-site-cddcf18`.

The user accepted the home preview and requested the same tones throughout,
allowing darker areas but not brighter broad backgrounds. The accepted home
palette is retained: page `#eeefeb`, raised surface `#f8f7f3`, secondary panel
`#e9ede9`, navy text `#203047`, secondary text `#586676`, restrained gold
`#d7b97d`. `#f8f7f3` is the maximum luminance for newly defined broad surfaces;
artwork, icons, text, semantic combat effects, and rarity accents are not a literal
pixel-brightness cap. Battle stages and emphasis chips intentionally remain slate.

## Additive, reversible implementation

`public/theme.css` is loaded last by ten public HTML documents: `index`,
`kahramanlar`, `ligler`, `privacy`, `crazygames-privacy`, `music-credits`,
`battle-preview`, `arena-3d`, `arena-model`, and `commander-training`.
Original CSS, JavaScript, images, models, server code, economic data, feature
flags, and account/game data are unchanged. Existing theme-color metadata and
four narrowly scoped body attributes are the only other HTML changes.

Covered states include login/guest controls, home/header, play/lobby, commander
development and skills, hero collection and details, friends and requests,
global invitations, store/reward/exchange presentation, moderation overlays,
auction, preparation, results/rematch, combat controls, standalone arena and
training pages, league and legal/help documents. The six home actions remain
Oyna, Komutan, Kahramanlar, Arkadaşlar, Mağaza, and İletişim. Contact remains its
existing mail link, not a new screen. No theme toggle or unrelated feature is
introduced. Admin and the unrelated legacy `original-heroes.html` are untouched.

The canonical and CrazyGames routes use the same theme asset. CrazyGames store
hiding and its existing Google/advertising restrictions are preserved. The CSS
does not change display, visibility, geometry, touch/scroll behavior, gameplay
resources, hero artwork, or rarity definitions. Keyboard focus, disabled states,
reduced motion, and forced-colors support are included.

## Verification performed

On Node 24.22.1 with the existing lockfile:

```sh
node --test *.test.js tests/*.test.* test/*.test.js
npm run audit:strict
git diff --check
```

- Full regression: **1,626 tests passed, zero failures, zero skipped**.
- Strict roster: **50/50** images, abilities, and reviewed power; no problems.
- Nine theme-specific tests cover loader ordering, preservation of styling and
  behavior, navigation, CrazyGames restrictions, broad-surface luminance,
  representative AA contrast, disabled ID specificity, semantic resource/rarity
  preservation, and local HTTP delivery under canonical and CrazyGames routes.
- CSS parsed with `tinycss2` without syntax errors; independent static cascade
  review checked key default, hover, focus, and disabled selectors.
- Original dark styles and source assets are unchanged, not removed or rewritten.

Contrast testing is source-based and representative, not a claim that every
possible composited pixel was measured. The implementation has **not** undergone
rendered browser QA: local Chromium was previously denied, and the available
cloud browser cannot open local/file/data previews. No bypass or public preview
hosting was used. The separate self-contained HTML screenbook uses source-based
sample states and is for review, not proof of runtime or screenshot verification.
Real-database integration and new balance simulations were not required or run
for this presentation-only change.

## Rollback without deleting the old site

Quick visual fallback: remove only the following last stylesheet link from the
affected public documents. Their original dark styles are still present:

```html
<link rel="stylesheet" href="/theme.css?v=accepted-gray-20261026">
```

Exact source rollback, before subsequent edits to these files: apply the
provided patch in reverse after checking it (do not reset unrelated work):

```sh
git apply --reverse --check accepted-light-theme.patch
git apply --reverse accepted-light-theme.patch
```

If the theme is committed and later published, revert its single theme commit
through the normal review/deployment process. Do not reset the whole repository
or database. The base Git reference and original visual-source copies in the
backup archive can also be used to inspect or restore individual files.

The backup archive preserves the original public HTML/CSS, patch, implementation
sources, tests, manifest, and verification logs. It is a theme/source rollback
backup, **not** a new database or full media backup. Existing media and all user
data remain untouched in the original repository/site.
