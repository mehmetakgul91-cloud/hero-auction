# Search appearance

The homepage is the canonical indexable URL: https://heroauction.com.tr/.
Privacy stays publicly accessible at `/privacy` and `/privacy.html` with
`noindex,follow`. Do not block these paths in robots.txt: Google must fetch
these pages to see noindex. The sitemap intentionally lists only the homepage.

## Images

- `/favicon.png`: 96 × 96 transparent PNG rasterization of the existing
  `/images/lobby-crest.svg` brand emblem, padded to a square without distortion.
  Source SVG viewBox was rendered as `-4 0 72 72`; Inkscape PNG export at 96 × 96.
  Keep the public favicon URL stable.
- The homepage's Open Graph, Twitter and VideoGame metadata reference the
  unchanged, existing active-roster artwork `/images/original/hero-01.png`
  (1374 × 1145). No new artwork or external asset dependency was introduced.
- `max-image-preview:large` remains enabled. Image, robots and sitemap responses
  use their appropriate MIME types. All remain crawlable.

These are eligibility/description signals, not a promise of Google ranking,
favicon display, or a thumbnail. Open Graph/Twitter also help social previews;
VideoGame image does not guarantee a Google rich result. The existing art is
not a 16:9 Discover-specific composition; no Discover eligibility is claimed.

## After deployment (requires owner authorization)

Use Search Console URL Inspection to check the homepage and privacy URL's
Google-selected canonical, last crawl and fetched HTML. Request homepage
indexing if appropriate. Google must recrawl privacy to process noindex;
changes do not remove an old search result immediately. Do not submit repeated
requests or remove the legal policy. No Search Console action is part of this
code change.

Official guidance:
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://developers.google.com/search/docs/appearance/favicon-in-search
- https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
