# Economy schema and activation — operator review runbook

**Prepared 2026-10-26. Not executed. No production SQL, environment change,
backup creation, deployment, new resource, permission or network change is
performed by this document.** The operator tools are not wired to `npm start`,
server boot, CI deployment, a Render pre-deploy command or an HTTP route.

## Established target and supported access

Read-only Render metadata checked at approximately 10:27 UTC:

| Resource | Verified metadata |
| --- | --- |
| Existing web service | `srv-db72kiaj9qps73b0b5tg`, `hero-auction`, Node, paid `0.5c-512mb`, one instance, Frankfurt |
| Existing database | `dpg-db88ehmq1p3s739vvodg-a`, `hero_auction_db`, PostgreSQL 18, paid `basic_256mb`, 1 GB, available, no pool/replica |
| Workspace | Both belong to `tea-db72hb3bc2fs73f30b80` |
| External DB access | Empty allow list. Leave it unchanged; do not retry the blocked external query. |
| Deployment | Service tracks `main` with On Commit auto-deploy. A push/merge is therefore a publication action, not merely saving code. |

Use the **existing service's Dashboard → Shell**, not a new service or ephemeral
shell. Paid web services support Dashboard Shell. An ephemeral shell is billed
and is explicitly outside this plan. No new SSH credential is needed for the
Dashboard path. Dashboard access itself must be available to the authorized
operator. [Render Shell documentation](https://render.com/docs/ssh)

The existing service and DB are in the same workspace/region, the scope of
Render's private network; project-environment isolation must still permit their
connection. Reuse the service's **already-configured `DATABASE_URL` internally**.
Do not display it, retrieve sensitive connection details, change the allow list,
copy it into a command, or switch to an external URL. The runner requires the
approved short hostname `dpg-db88ehmq1p3s739vvodg-a`; if the existing URL does not
match, it refuses before connecting. Review that mismatch through the authorized
operator rather than loosening the check.
[Private network](https://render.com/docs/private-network),
[Postgres connection/access rules](https://render.com/docs/postgresql-creating-connecting)

Render supplies `RENDER`, `RENDER_SERVICE_ID`, `RENDER_SERVICE_TYPE`,
`RENDER_GIT_COMMIT` and `RENDER_GIT_REPO_SLUG`; the tools verify these instead of
trusting a typed target label alone. They reject preview deployments.
[Default environment variables](https://render.com/docs/environment-variables)

**Why not pre-deploy?** Render supports it on this paid service class, runs it
between build and deployment on a separate instance, and gives it a 30-minute
limit. It is useful for repeatable migrations but changes persistent deployment
configuration. This deliberately one-time, operator-reviewed 0→5 transition
uses Dashboard Shell instead. Keep the existing start/build commands unchanged.
[Deploy/pre-deploy behavior](https://render.com/docs/deploys#pre-deploy-command)

## Stop/go gates, in order

1. **Review and test exact code.** All ordinary and economy tests must pass for
   the exact release commit. In addition to mock/CLI refusal tests, require both
   scenarios of the separate `Economy operator PostgreSQL integration` workflow
   to pass. It executes the actual operator catalog, hashing and DDL queries on
   isolated PostgreSQL 18; a green chest/upgrade harness does not by itself test
   these tools. A prepared workflow is not a passed run. No production fixture
   users or grants.
2. **Approve code-only publication separately.** Publish the reviewed commit
   with all economy flags OFF. Confirm that the existing service is running that
   exact commit before using its tools. Do not paste arbitrary scripts into a
   live Shell to bypass the reviewed-commit guard. If approval to publish is
   absent, this plan stops here.
3. **Verify recoverability before DDL.** On the existing DB's Recovery page,
   inspect its actual PITR window and successful export records. Record a
   non-secret export reference/time and durable retention location, and confirm
   that the export is complete and can be listed/read with matching PostgreSQL
   18 client tools. A backup name typed into the CLI is an operator attestation,
   **not automated proof that a backup exists**. Creating/downloading an export
   requires the appropriate explicit authorization. Do not put a production
   dump or signed download link in a public artifact or ordinary task log.
4. **Run read-only preflight, then review the output.** Confirm target/build,
   schema version, manifest, DDL/application privileges, counts/fingerprints,
   capacity and current live-match activity. This command cannot grant missing
   privileges. Any partial/untracked schema, unexpected table/constraint,
   wrong version, enabled flag, or unavailable connection is a stop.
5. **Obtain explicit approval for the printed manifest and one-time migration.**
   Only then run the apply command once. No activation is included.
6. **Read-only postflight.** Verify version 5, exact manifest/schema digest,
   correct constraints and permissions, and the apply command's preservation
   proof. Keep all flags OFF until activation approval and safe cutover below.

Paid Render Postgres currently has continuous PITR: Hobby workspaces have a
3-day window, Pro or higher 7 days. A recovery cannot target the newest ten
minutes. Logical exports are retained seven days, so an old dashboard export
alone is not durable archival proof. PITR creates a **new database**; neither
creating a recovery instance nor restoring over production is authorized here.
[Current recovery/export documentation](https://render.com/docs/postgresql-backups)

## Commands for later approval — not executed

Replace placeholders only with the **reviewed** 40-character commit, the exact
manifest printed by preflight, and the verified non-secret export reference.
Placeholders intentionally fail the guards. Do not use `set -x`, `printenv`,
`env`, `echo "$DATABASE_URL"`, or a connection-info command.

### 1. Read-only preflight, expected schema 0

```sh
node tools/economy-preflight.mjs \
  --expect-service srv-db72kiaj9qps73b0b5tg \
  --expect-database hero_auction_db \
  --expect-major 18 \
  --expect-commit REVIEWED_40_HEX_COMMIT \
  --expect-version 0 \
  --target 005
```

Output contains only release/target metadata, migration hashes, schema hash,
aggregate row counts/fingerprints and persisted-room counts—not credentials,
account IDs, wallet amounts or commander profiles. `backupVerified:false` and
`activationApproved:false` are intentional. Inspect actual DB disk usage in
Render before proceeding; logical database size alone is not free disk space.

### 2. One-time apply, only after explicit migration approval

```sh
node tools/apply-economy-migrations.mjs \
  --expect-service srv-db72kiaj9qps73b0b5tg \
  --expect-database hero_auction_db \
  --expect-major 18 \
  --expect-commit REVIEWED_40_HEX_COMMIT \
  --expect-version 0 \
  --target 005 \
  --manifest-sha256 REVIEWED_64_HEX_MANIFEST \
  --backup-reference VERIFIED_EXPORT_REFERENCE_AND_UTC_TIME \
  --confirm APPLY_HERO_ECONOMY_001_TO_005
```

Required OFF/unset flags: `HERO_DIAMONDS_ENABLED`,
`HERO_DIAMOND_EXCHANGE_ENABLED`, `HERO_DIAMOND_SIGNUP_BONUS_ENABLED`,
`HERO_LOGIN_REWARDS_ENABLED`, `HERO_MAGIC_DUST_ENABLED`,
`HERO_VICTORY_CHESTS_ENABLED`, `HERO_REWARDED_ADS_ENABLED`, and
`COMMANDER_TEST_GUEST_MODE`. Unknown values are refused; this tool never changes
an environment variable.

The runner pins the five SQL files by SHA-256. Each currently has its own
`BEGIN`/`COMMIT`; a narrow SQL lexer verifies and removes only those exact outer
statements. A naive outer transaction around the unmodified files would not
provide all-five atomicity. Only the reviewed CREATE TABLE/INDEX statements and
005's dust-cost column addition are accepted. No general SQL input is supported.
[PostgreSQL transaction semantics](https://www.postgresql.org/docs/18/sql-begin.html)

A single repeatable-read transaction takes a non-waiting advisory lock, checks
schema 0 is truly untracked/empty for all 12 new economy tables, creates the
migration ledger and applies 001–005. Existing gold-wallet and commander-profile
row counts/SHA-256 digests are compared **within that transaction**. New economy
tables must be empty; no existing user receives currency, levels, debt, a reward
or a retroactive charge. All constraints/indexes must be valid and required
privileges present. The complete manifest, schema hash, build, backup reference
and preservation digest commit together in the ledger.

Timeouts are bounded: connection 5 seconds, statements 10 seconds, lock waits
2 seconds, idle transaction 15 seconds, whole transaction 60 seconds. Stop and
investigate a timeout; do not increase limits or permissions automatically.
[PostgreSQL client timeouts](https://www.postgresql.org/docs/18/runtime-config-client.html)

### 3. Read-only postflight

Run the preflight command again with `--expect-version 5` and the same reviewed
commit. It verifies the durable ledger's hashes and live schema. Independent
before/after production snapshots can differ because real play may continue;
the apply transaction's preservation proof is the test that **the migration**
did not alter existing gold/profiles.

## Unknown outcome, drift and rollback

- Any pre-COMMIT error rolls back all DDL and ledger writes. No partial stage is
  intentionally committed.
- `COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT` is **not proof of rollback**.
  First inspect schema with read-only preflight. Version 5 must match the same
  manifest/schema; version 0 must have no new economy objects. A mismatch stops.
- An explicitly approved retry of the exact apply command with the same commit,
  manifest and backup reference verifies an already-committed version 5 and
  returns `already_applied_verified` without rerunning DDL. It does not overwrite
  unknown or partial schemas. Review the ledger before retrying any other error.
- Do not drop new tables as a routine rollback. Once active, receipts are
  financial-integrity records for in-game balances. Keep them and disable the
  relevant feature via a separately approved rollback procedure.
- A backup restore/cutover or any grant, resource, secret, allow-list or plan
  change is a separate authorized operation. Never run a destructive restore
  command against the live database as a test.

## Separate activation cutover (still gated)

Schema publication is not activation. After verified schema 5 and separate
approval, the intended chest/dust dependency set is
`HERO_DIAMONDS_ENABLED=1`, `HERO_MAGIC_DUST_ENABLED=1`,
`HERO_VICTORY_CHESTS_ENABLED=1`. These also change the existing 21+ diamond and
new 16+ dust upgrade requirements; confirm this together with chest access.
Daily login, welcome and exchange remain OFF unless **separately authorized**.
No combination creates purchases, cash-out or a chest-sale route.

Before this cutover, stop **new paid match admissions** without interrupting
existing battle/settlement APIs, let active paid matches finish, and verify
in-memory pending gold plus durable pending chest work is empty. Persisted
room counts from preflight are diagnostic, not proof that an in-memory queue is
empty. A normal rolling Render deploy can briefly overlap old and new workers;
the current single-process room coordination must not be treated as a distributed
lock. If no reviewed admission-pause/drain mechanism is available, activation
remains blocked pending an explicitly approved safe maintenance procedure.

Activate while admissions remain paused; verify exact deploy commit, runtime
policy report, schema readiness, authenticated balance reads and authoritative
receipt behavior without minting production test rewards. Resume paid admissions
only after approval/verification. Monitor real outcomes, exactly-once receipts,
legacy 120-gold suppression, draw refunds and error logs. Do not substitute a
successful HTTP page load for economy settlement validation.

## Validation recorded for this preparation

`node --test tests/economy-release-tools.test.mjs` exercises CLI refusal before
connection, strict lexer, read-only preflight, permissions/schema guards, atomic
rollback, preservation failure, lost-COMMIT replay and redaction using an injected
SQL model. It makes **no network/database connection**.

`tests/economy-release-postgres-harness.test.mjs` verifies the independent
integration harness's fail-closed environment guard and workflow configuration.
These tests also make no database connections.

### Actual operator integration requirements

The separate `.github/workflows/economy-release-postgres-tests.yml` has two fresh
official, digest-pinned PostgreSQL 18 service containers, one per matrix scenario
(`normal`, `lost-commit`). It uses Node 22 and the locked npm dependencies with
lifecycle scripts disabled. No repository secret or Render connection is used.

For each **fresh disposable** service, `tools/test-postgres-economy-release.mjs`
accepts only these exact fixture settings:

```sh
HERO_ECONOMY_RELEASE_TEST_DB=postgresql://test:test@127.0.0.1:5432/hero_auction_db \
HERO_ECONOMY_RELEASE_TEST_CONFIRM=CREATE_DISPOSABLE_OPERATOR_FIXTURE \
HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE=normal \
node tools/test-postgres-economy-release.mjs
```

The second scenario uses `lost-commit` in place of `normal`, in a **different
fresh container**, never by resetting/reusing the first database. The database
name intentionally matches the operator's hardcoded identity check. Its only
permitted endpoint/credentials are the synthetic loopback fixture above; this
does **not** widen the production tool's Render or internal-host checks. Any
`DATABASE_URL`, `RENDER`/`RENDER_*`, `PG*` connection setting, enabled economy
flag, wrong URL/confirmation/scenario, non-test database role, non-PG18 server or
nonempty database refuses the harness. Never run it in a production Shell or
unset production variables to make it pass.

The harness invokes the exported preflight/apply functions against a real `pg`
client. It checks real read-only enforcement, baseline schema compatibility,
untracked partial schema, unvalidated constraints, advisory-lock contention,
failures after migration003 and during ledger insertion, changed-wallet/profile
rollback, the all-five single transaction, preserved historical gold/levels,
empty new economy tables, manifest/schema replay and tracked drift. The lost
response scenario throws only **after PostgreSQL actually commits**, then proves
read-only postflight and exact retry do not rerun DDL. Query/transaction limits
and a 120-second harness deadline bound execution. Only fixture-owned temporary
schema changes are undone; no database/schema drop or broad reset exists.

Real CI execution of these newly added operator queries and actual production
backup/schema/grants remain gates until their results are recorded for the exact
reviewed commit. Local safety tests are not substitute evidence.
