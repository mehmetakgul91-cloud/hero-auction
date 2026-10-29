# Fixed bot economy — local implementation, publication blocked pending verification

## Approved policy

Version `bot-fixed-v1`. Every **new paid bot game** costs **50 virtual gold**.

| Difficulty | Selected commander branch | Off-branches | Win receipt |
| --- | ---: | ---: | --- |
| Easy | 15 | 15 | 100 gold |
| Medium | 25 | capped at 20 | 125 gold + 2 magic dust |
| Hard | 40 | capped at 20 | 175 gold + 5 magic dust |

Loss: no reward/refund. Tie: refund 50 gold. A verified unrecoverable server interruption: refund 50 gold, no chest. Every bot outcome grants **zero diamonds**. No random drops, daily cap, new inventory or client claim endpoint. The existing chest animation presents an automatically credited win receipt, not an item to open later. PvP reward policy, ranked rating policy and combat math are unchanged. Native development remains paused.

## Admission and consent

The web client displays the fixed fee and difficulty-specific reward before each direct game/rematch. The 60-second random-match timeout becomes `bot_offer`; it does not charge or start a bot game. Acceptance requires a fresh per-game request UUID and `botTermsVersion: 'bot-fixed-v1'`. Canceling the offer does not charge. Retrying an uncertain admission must reuse the same UUID. Repeated account/UUID returns the original game/token; reusing it with another difficulty conflicts. A distinct UUID cannot admit another bot game while a prior paid bot entry is unresolved.

Amounts and outcomes are selected by the server. Browser payloads never supply trusted room state, prices, rewards or a settlement winner. Bot seat has no account wallet and is never charged.

## Storage and migration

`migrations/009-bot-fixed-economy.sql` is **not automatically applied**. It depends on the existing gold/room tables and the magic-dust wallet from migration 005. It adds:

- `hero_auction_bot_entries`: immutable account/request UUID and match identity, 50-gold debit balances and admission snapshot.
- `hero_auction_bot_settlements`: one terminal outcome per match, fixed gold/dust amounts, before/after balances and terminal room snapshot.

Entry debit, entry receipt and durable room write are one PostgreSQL transaction. Settlement credit/refund, settlement receipt and terminal snapshot are one transaction. Match-scoped and account-scoped advisory locks serialize retries; wallet row locks use gold then dust. No diamond table is touched. Integer overflow fails closed. Admission reconciliation takes the same account lock before treating a missing receipt as proof of no committed entry; stale uncharged offer snapshots cannot replace the paid entry snapshot. Room writes reject unrelated or newer identities rather than overwrite them; a failure rolls the debit back.

A lost `COMMIT` response is marked uncertain. A retry must look up/reuse the same admission UUID or settlement match ID, not create another request. Receipts, not in-memory status, decide whether money has already moved. A paid terminal snapshot includes `matchSettled`, the once-incremented series, and the receipt. Recovery prefers a terminal receipt over stale room flushes, but never replaces a newer room/rematch.

The app fails closed when database/schema/dust prerequisites are unavailable. Guest/RAM preview is **not a durable economy test mode** and must not charge or award paid bot currency. Existing free bot rooms, which have no `botEntry`/`botEconomyVersion` marker, remain free and receive no new rewards; no migration backfills a debit or retroactively grants a chest. New rematches require new consent and a new paid receipt.

## Recovery and abandonment

On restart, normal auctions/formation waiting retain their paid identity and resume. An in-progress live battle whose authoritative process-memory simulation was lost is a server-certified `server_restart` interruption; refund once. A previously persisted pending terminal outcome is retried without changing its winner or amounts.

A disconnect or intentional departure is not evidence of server failure. Paid abandoned games expire conservatively as server-authorized forfeits (loss, no refund). Refund authority is an internal server call, never a browser-controlled flag. There is no broad “disconnect refund” that could be farmed. Operators must not manually delete unpaid/unsettled receipt rows to unblock accounts.

## Verification status and release gate

Executed locally:

- `node --test tests/bot-economy.test.mjs tests/bot-postgres-harness.test.mjs`: **33 passed**. These include fixed outcomes, serialized retry model, distinct-request blocking, failed writes/rollback, lost COMMIT response, receipt recovery, wallet bounds, old-free exclusion, trusted failure/forfeit, collision/rematch guards and refusal of unsafe DB targets.
- JavaScript syntax checks for the ledger and PostgreSQL harness passed.

**These are transaction-model tests, not proof of PostgreSQL isolation.** The model deliberately serializes transactions and cannot establish real lock behavior, migration acceptance, connection loss semantics or real server process restart behavior.

`tools/test-postgres-bot-economy.mjs` provides eight real-PostgreSQL integration groups. It refuses to connect unless `HERO_BOT_ECONOMY_TEST_DB` is exactly `postgresql://test:test@127.0.0.1:5432/hero_bot_economy_test`, `DATABASE_URL` is absent, and the target public schema is empty. It creates only synthetic fixture accounts, never drops/resets a database, and never uses production credentials. It covers concurrent admission and settlement, all difficulty/outcome combinations, lost COMMIT responses, receipt lookup/recovery, insufficient funds/overflow, trusted interruption/forfeit, transactional SQL-fault rollback and room collision/rematch behavior.

**Real PostgreSQL execution is currently unverified.** Official Debian PostgreSQL packages were obtained and an isolated data directory initialized by a separate test worker, but startup was blocked by the environment's Unix-socket permissions; an escalation failed before execution. No further server startup or alternate execution route was attempted. The eight PostgreSQL groups, SQL migration execution and live paid-bot HTTP/restart flows therefore remain release blockers. Run them in a permitted disposable local/CI environment, then run the repository's full test suite and authenticated browser/HTTP flows before publication. No push, PR, deployment, live schema change or live-account currency transaction is authorized by this local implementation task.

### Retained paid live-combat integration workflow (not executed here)

`tools/test-postgres-bot-live.mjs` preserves the former full bot live-HTTP workflow instead of bypassing persistence to keep a RAM-only test passing. It requires the exact isolated `HERO_BOT_LIVE_TEST_DB=postgresql://test:test@127.0.0.1:5432/hero_bot_live_test`, no ambient `DATABASE_URL`, and a fresh empty public schema. Its synthetic server environment explicitly disables preview guest mode and PvP random chests while enabling persistent diamond/dust reads; only fixture guest accounts are created.

The retained workflow exercises four real auction/live-combat games, authenticated commander actions, invalid tokens, reconnection without reroll/reset, shields/Last Stand damage invariants, commander rotation, 15/25/40 levels with off-branch cap20, per-game consent and paid rematch, durable settlement waiting, exact fee/reward/refund balances, zero diamond awards and unchanged human commander progression. The configured accelerated clock is fixture-only. Syntax and four fail-closed target refusals passed; **the full workflow remains unexecuted because database/server sockets are blocked in this environment**. Existing timing/deterministic combat expectations must be verified at the new commander levels in permitted CI, not presumed to pass.

## Final local verification checkpoint

- Full `npm test`: **2,589 passed, 0 failed, 0 skipped**.
- `npm run audit:strict`: **50/50 active heroes; no problems**.
- Runtime used: **Node 24.22.1**. Repository engine target is **26.12.1**; repeat checks on that target before release.
- Source/VM orchestration covers uncertain direct/fallback/rematch recovery, stale pointers, immutable outcomes, serial room flushes and maintenance drain. The ordinary no-DB HTTP tests assert refusal rather than bypassing the ledger. The former paid-bot combat scenario is preserved as the guarded real-PostgreSQL live harness, not silently counted as executed.
- Browser visual, reconnect and modal dismissal QA remains unverified. Real PostgreSQL migration/concurrency and authenticated paid-bot HTTP/restart remain blocking gates.

Recovery of already admitted receipts continues if the dust feature flag is later disabled, provided the required durable schema is still available; new admissions remain closed. Uncertain admission sources stay reserved until an account-locked receipt lookup establishes the outcome. Room flush batches are serialized; queued dirty codes remain reserved and per-code deletion writes are tracked as well as updates, preventing stale room snapshots/deletions from racing an entry or settlement.

Startup recovery fetches unresolved entries and terminal receipts belonging to retained matching rooms only. It does not resurrect expired terminal rooms or replay historical win/loss counters: the existing social snapshot's bounded match-history dedupe cannot safely replay all financial receipts. Wallet outcomes and series are durable; social win/loss counters retain the existing separate-write limitation (a crash between receipt commit and social save can omit a counter update). Ranked bot rating changes remain zero.

### Prepared CI gate — local file only, not run

`.github/workflows/bot-economy-postgres-tests.yml` prepares a read-only-checkout GitHub Actions gate with an official disposable PostgreSQL17 service, hardcoded synthetic `test` credentials and loopback-only port mapping. It uses the repository's `engines.node` target (26.12.1), installs locked dependencies without lifecycle scripts, runs the full `npm test` suite with `DATABASE_URL` unset, and then runs both guarded PostgreSQL harnesses against separate fresh `hero_bot_economy_test` and `hero_bot_live_test` databases. The fixture database creation step checks the empty public schema and does not drop/reset existing data. No repository/production secrets are consumed.

YAML structure validation and two workflow safety tests passed locally (plus the eight target-refusal guards). **This workflow has not been published or executed.** A future push/PR still needs user authorization; preparing this file neither authorizes publication nor establishes a passing CI result. Successful real PostgreSQL and paid live-combat jobs remain prerequisites to a release decision.

The existing game coordinator still assumes one authoritative application instance for live rooms; PostgreSQL receipt locks make wallet operations retry-safe but do not turn the in-memory combat engine into a multi-instance distributed simulation. Do not enable overlapping active game servers as part of publication without a separate room-ownership design and tests.
