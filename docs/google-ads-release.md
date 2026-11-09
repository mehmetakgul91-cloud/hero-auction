# Google Ads read-only reporting release gates

Target: Hero Auction customer 838-660-5798, campaign 24441908595.
Identity: hero-ads-reader@hero-action.iam.gserviceaccount.com in project hero-action.
Google Ads Users page confirmed Read-only role. Managers page showed no linked manager.
No developer token is sent. Authentication still requires a short-lived OAuth access token.

## Pending release gates
- Exact final code: Node 26.12.1 full `npm test`, `npm run test:admin`, browser QA.
- Disposable PostgreSQL jobs in `.github/workflows/admin-analytics-postgres-tests.yml`, not production DB.
- Draft PR exact commit checks green, review final diff; do not treat local unit tests as remote CI.
- Backend credential transfer directly to Render; never chat, repo, client bundle, screenshots or logs.
- Actual API query for target account and compare period/timezone/currency with Google Ads.
- Release exact reviewed commit, verify deployed SHA and owner-only endpoint access.

## Safe credential handoff (only after test/release coordination)
Render service srv-db72kiaj9qps73b0b5tg -> Environment -> Secret Files -> Add file.
Filename: hero-ads-reader.json. User pastes JSON directly into Render, not chat.
Runtime path: /etc/secrets/hero-ads-reader.json.
Secret file Save triggers deployment: coordinate maintenance/deploy timing before user saves.
Set HERO_GOOGLE_ADS_SERVICE_EMAIL=hero-ads-reader@hero-action.iam.gserviceaccount.com.
Keep HERO_GOOGLE_ADS_REPORT_ENABLED unset or 0 until tested code and credential are ready.
Enable with value 1 in controlled release. No existing env values need viewing or copying.

Render workspace HOBBY lacks managed OIDC/WIF (Pro+); no paid upgrade authorized.
No Google Cloud project roles or domain-wide delegation required for direct Ads account access.

## Report semantics and rollback
Metrics cost_micros is advertising interaction cost, not all-in billing. Taxes, fees and adjustments may differ.
Do not infer remaining all-inclusive budget, true acquired people, CPA or Google conversions from this report.
Internal UTM/game funnel remains a distinct source. Missing connection/error means unknown, not zero.
On-demand 15-minute cache; stale data clearly labeled and retains original retrieval timestamp.
If integration fails: flag off, verify unknown state; do not alter ads/budgets. Revoke unused key if abandoning setup.
