# Minimal campaign / first-match funnel (local draft)

Prepared only. No production configuration, migration, publish, PR or deployment is authorized by preparing this change. Existing game/economy behavior and first Easy bot onboarding are unchanged.

## What it measures

First-party, account-linked attribution **from authenticated newcomer onward**, not anonymous visits, advertisement clicks, installs, unique people, or verified marketing attribution. Google login is not a Google-search referral. Source is an untrusted client claim, not proof of acquisition. Advertising platforms' click counts remain separate; do not divide this report into an in-app click-to-install conversion rate.

Only an exact allowlisted `utm_source`, `utm_medium`, `utm_campaign` tuple becomes a canonical campaign ID. No organic/direct/empty/unconfigured traffic enters this extra measurement. Query duplicates, unknown campaigns and malformed/overlong labels fail closed. No gclid/fbclid/ad identifiers, full links, raw query, referrer, fingerprint, cookie or anonymous tracking ID are stored/sent by this feature. Hosting request logs are separate and may contain requested URLs. Use ordinary non-personal campaign labels, never names/emails/IDs in tags.

Browser: canonical ID in tab sessionStorage for at most 30 minutes, bound to the first authenticated account. No auth token persisted by the module. Account switching does not transfer attribution. Failed network/storage and missing configuration never prevent play. Bounded attempts deliberately favor gameplay over perfect analytics: events can be missed on failure, tab close or reload. Attribution racing a fast commander selection fails closed and undercounts; gameplay never waits for attribution.

Server: existing signed Google/guest identity; never client account identity. Newcomer eligibility requires no commander and no recorded bot, reward, retained room or social-match history. First-touch immutable account row, maximum one insert plus three first intro timestamp updates. Attribution/intro claims remain untrusted even after validation and can be forged by the authenticated account; not billing/fraud evidence. No historical backfill.

`intro_viewed` means the intro was displayed; `intro_skipped` means Skip explanation was chosen; `intro_completed` means the final start CTA was pressed, **not** that the bot admission succeeded. Skip and complete may both be counted for an account. These columns are not a strictly ordered funnel.

Bot start derives from the **first ever** durable bot entry across all difficulties, then checks time >= attribution, Easy, zero entry gold and `bot-free-v2`. A first Hard/Medium/paid bot followed by Easy does not count. Completion derives from matching durable settlement with finished battle evidence, never client completion reports. Provable forfeit, server failure, idle cancellation, pending and other-terminal are separate. Existing snapshots can lack explicit forfeit provenance (the economy clears botForfeit); ambiguous terminals are not guessed as completed. No economy transaction/receipt is altered or held up by analytics.

Reports are attribution cohorts for the selected trailing 1–30 days, not event-date totals. A cohort's result can arrive later. Durable entry/settlement joins are restart/retry-safe; each account contributes at most one first bot match. A first game played elsewhere before its first durable bot match can only be excluded where existing server history proves it. Guests are accounts, not proven distinct people.

## Configuration (future approved rollout only)

Default OFF. Both flags and a nonempty valid allowlist are required:

```
HERO_PLAYER_ANALYTICS_ENABLED=1
HERO_CAMPAIGN_MEASUREMENT_ENABLED=1
HERO_CAMPAIGNS=[{"id":"launch_nov","source":"instagram","medium":"social","campaign":"launch_nov"}]
```

Maximum 20 campaigns; each of the four fields is a lowercase ASCII slug `[a-z0-9][a-z0-9_-]{0,47}`. IDs and tuples must be unique. Extra fields/invalid JSON disable the policy, not the game. Example link: `https://heroauction.com.tr/?utm_source=instagram&utm_medium=social&utm_campaign=launch_nov`. No actual advertisement is created. Canonical IDs must not be repurposed for a different campaign. Removed campaigns are hidden from collection/report until configured again; retention does not reset.

`GET /api/info` advertises sanitized allowlist only when policy and storage preflight are available. Authenticated `/api/campaign/attribute` accepts only campaignId; `/api/campaign/event` only a three-value intro event. There is no client bot start/completion endpoint. Owner-only `POST /api/admin/campaign-funnel` accepts `days` (1–30, default 7). All routes retain existing owner/signed-auth checks. Response contains only campaign IDs and total counts, no accounts, names, emails, room IDs or individual times.

## Schema, retention, deletion and rollback

`migrations/012-campaign-measurement.sql` is an **unapplied draft**, one analytics-only table referencing wallets with ON DELETE CASCADE. Runtime only preflights, never migrates; absent/partial schema leaves capability off and gameplay available. Existing 001–011 economy/admin release manifests and operators are unchanged. **Do not append 012 to old approved manifests or rerun all historical migrations.** Before any rollout, separately review the exact 012 digest/schema on disposable PostgreSQL18, take a verified backup, obtain explicit migration/enablement approval, and prepare a narrow 012-only release operator using the existing release-target/commit verification pattern. The narrow tools/campaign-preflight.mjs and tools/apply-campaign-migration.mjs operators and campaign-only approved schema/manifest are supplied. They never apply 001–011 or enable flags; merging code alone does not activate measurement.

Account-linked rows expire 30 days after initial attribution (never extended by replay). Reads exclude expiry immediately; startup and hourly cleanup deletes up to 1000 expired rows per pass, including when collection is disabled. Large backlog, outages and backups can delay physical erasure. `deleteCampaignMeasurement({database,accountIds})` is the bounded (<=100) authenticated-operator integration helper for verified deletion requests; no public deletion endpoint or new self-service account deletion is added. Integrate this deletion with existing manual privacy request procedure. Wallet deletion cascades. Durable game/economy receipts retain their existing retention rules.

Rollback: disable HERO_CAMPAIGN_MEASUREMENT_ENABLED; new collection stops, expired campaign cleanup continues in this version. Do not drop wallets, bot receipts or rewrite balances. Schema can remain. Rolling back to old code removes this cleanup task, so an approved separate expiry schedule would then be required. Deleting the analytics table is a separate irreversible operation, not an automatic rollback step.

## Verification

Node26 unit/integration suite and diff check run locally. The actual PostgreSQL18.6 network/concurrency harness passed locally on disposable loopback 127.0.0.1:55432 with isolated test credentials; the cluster was shut down afterward. The same harness is wired into CI. No production DB was used. The actual admin module with current CSS was checked in Chromium at 320, 390 and 1024px with synthetic data: no horizontal overflow after a scoped long-label wrapping fix, 30-day filter, empty/disabled/error and logout-clear behavior verified. This is not physical iPhone/Safari or production-account end-to-end verification.


## Explicit migration012 operator (Render Shell only after authorization)

Preserves old release manifests and all existing tables/data. Requires the existing internal `DATABASE_URL` already in Render; never paste or print credentials. Environment must identify web service `srv-db72kiaj9qps73b0b5tg`, repo `mehmetakgul91-cloud/hero-auction`, database `hero_auction_db`, role/database owner `hero_auction_db_user`, internal host `dpg-db88ehmq1p3s739vvodg-a`, PostgreSQL major18 and the exact deployed commit. Ambient `PG*` connection overrides are refused. `HERO_CAMPAIGN_MEASUREMENT_ENABLED` must be absent/empty/0. Other existing analytics/economy flags remain untouched.

Set `RELEASE_COMMIT` to the verified full deployed SHA, and `BACKUP_REFERENCE` to the externally verified current backup identifier. Do not use placeholders as proof. Read-only preflight first:

```sh
node tools/campaign-preflight.mjs --expect-service srv-db72kiaj9qps73b0b5tg --expect-database hero_auction_db --expect-owner hero_auction_db_user --expect-major 18 --expect-commit "$RELEASE_COMMIT" --expect-state absent
```

Reviewed fingerprints:
- migration012 SHA256: `ed57465521fa1693aff47a18f8898deac2ef33c7b5895988bb17abf617899625`
- campaign manifest SHA256: `8269dbd358cd18106214165727ab8b45615f9bdeebf168ac5669a91923c126ce`
- approved PG18 schema SHA256: `bde8c685a3cdc55f0b8d32f5857a13507e8a7a0f52dadd569e6cc6038bb53817`

Apply only after matching preflight, backup verification and migration approval:

```sh
node tools/apply-campaign-migration.mjs --expect-service srv-db72kiaj9qps73b0b5tg --expect-database hero_auction_db --expect-owner hero_auction_db_user --expect-major 18 --expect-commit "$RELEASE_COMMIT" --expect-state absent --manifest-sha256 8269dbd358cd18106214165727ab8b45615f9bdeebf168ac5669a91923c126ce --schema-sha256 bde8c685a3cdc55f0b8d32f5857a13507e8a7a0f52dadd569e6cc6038bb53817 --backup-reference "$BACKUP_REFERENCE" --confirm APPLY_HERO_CAMPAIGN_012_ONE_TABLE
```

Then repeat the preflight with `--expect-state complete`. One advisory transaction lock, repeatable-read snapshot, 2-second lock timeout, 10-second statement timeout and 60-second transaction cap protect execution. Only the two pinned CREATE statements run, in one transaction. Unexpected/partial schema refuses; exact existing schema returns a no-write replay. Existing schema and per-table content digests are compared inside the same snapshot; this does not imply unrelated live game writes were globally paused. A commit outcome-unknown message requires read-only complete preflight before any retry. There is no new migration ledger; output proves schema state, not historical provenance. No activation or config mutation occurs.

Operator verification: real disposable PostgreSQL18.6 network engine passed read-only absent/complete preflight, atomic apply, injected post-DDL rollback, exact replay, mismatched schema refusal and unchanged wallet/schema proof. Test adapter checks actual `test`/`hero_campaign_test` identity before substituting target fields for the production identity validator; runtime target/build/refusal logic is tested separately with synthetic environment values. This is not a production preflight.
