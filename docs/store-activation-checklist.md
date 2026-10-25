# Store / free rewards: activation review and PostgreSQL gate

Review baseline: local `a2c78c6` (store foundation restored on MAIN `65f84dc`).
This document accompanies the prepared disposable-CI test workflow/harness.
It is **not** production migration approval, a production query, or evidence of
a PostgreSQL pass. Migration SQL 001–004 is unchanged. Day 7 is **5 diamonds**;
the separate new-Google welcome gift remains 10. The approved test execution
route is the official PostgreSQL 18 GitHub Actions service described below;
its real-database result is pending the published commit’s CI run.

## Blocking gates before changing production

- Obtain explicit authorization for the exact release, migration files, target,
  and flags. Keep purchases and rewarded advertisements disabled: these files do
  not implement provider verification, pricing, checkout, or ad verification.
- Confirm the coupled economy behavior: `HERO_DIAMONDS_ENABLED=1` is required for
  either free-diamond campaign **and** makes all 21+ commander upgrades charge
  diamonds. Guest/CrazyGames accounts cannot earn these Google-only rewards.
- Validate the exact files on an approved, isolated real PostgreSQL instance.
  SQL-model passes do not establish database types, FK enforcement, row locks,
  WAL durability, grants, or deployment correctness.
- Capture and compare catalog metadata below before and after migration, using
  the actual application role/search path. A successful re-run or existence of
  a table is not sufficient: `IF NOT EXISTS` does not validate its definition.
  [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- Confirm backups/restore ownership and an approved rollout window. Foreign-key
  DDL may need locks on existing referenced tables; use bounded lock/statement
  timeouts and stop on error rather than retrying blindly.

## Exact dependency and service alignment

| File | Objects | Required existing objects | Runtime consumer |
| --- | --- | --- | --- |
| 001 | diamond wallets, upgrade receipts, debit-only diamond ledger + serial sequence | gold wallets, its account PK | `paid-diamonds.js` |
| 002 | two-currency exchange receipt/ledger | 001 diamond wallets | `paid-diamond-exchange.js` |
| 003 | Google registration markers, fixed-10 signup receipts | 001 diamond wallets; runtime also reads profiles, commanders, admin accounts and initializes gold | `diamond-signup-bonus.js` |
| 004 | exact daily reward receipt/ledger, streak | gold wallets + user profiles and their account PKs; runtime also requires 001 diamond wallets | `login-rewards.js` |

Apply in numeric order if the entire foundation is authorized. 002, 003 and 004
are not dependent on one another. Although 004 has no diamond-wallet FK, its
service reads that table on every claim and may create its row on day 7; 001 is
therefore a real runtime dependency. None of these files backfills existing
accounts or changes existing currency/commander rows.

Important schema invariants to match to the **exact migration definitions**:

- Normal permanent/WAL-logged tables; expected columns/types/defaults/NOT NULLs.
  Currency columns are PostgreSQL `integer`, not floating point; account keys
  are text. The ledger ID is `bigint` with its owned serial sequence.
- Diamond wallets: account PK/FK to gold wallets, zero default, nonnegative.
- Upgrade receipt: account/request PK, branch/from/to/cost checks; diamond ledger
  is debit-only and references that receipt. Existing gold curve and 21+ diamond
  prices are computed by service, not caller input.
- Exchange: account/request PK, existing diamond-wallet FK, positive spend/rate,
  exact bigint multiplication and before/after equations.
- Signup: account-unique registration and receipt, Google-only provider, fixed
  amount 10 and before/after 0→10, wallet/registration FKs. Existing accounts
  remain ineligible; service performs conservative existence checks before writes.
- Login reward: account/date PK and `(account,date,day_index)` unique key; exact
  days 1–6 gold 100/150/200/250/300/400 and day 7 gold 0, diamonds 5; nonnegative
  balances and bigint equations. Streak FK includes all three fields so its day
  agrees with the receipt; provider is Google. No cascade deletion is specified.
- Required constraints are validated/enforced, not deferred; supporting indexes
  are valid/ready. Unexpected policies, rules, user triggers, extra mandatory
  columns, partitioning, or duplicate/shadow relations require review first.

Service locking remains compatible: claim takes profile→gold→diamond; upgrade
commander→gold→diamond; exchange gold→diamond. Signup uses an advisory lock and
new profile/gold/diamond inserts, or gold→diamond on an eligible replay. The claim
never takes a commander lock after holding a wallet. Its receipt, credit, and
streak write are one transaction; old-date retry recovers only its own receipt.

## Catalog-only preflight SQL (not executed by this review)

Run only after authorization, through an approved connection. Do not print a
connection URI, credentials, environment contents, wallet rows, member IDs, or
receipt rows. Do **not** call normal server bootstrap to do a read-only check:
`initializeDatabase()` performs DDL and social writes.

The following queries read catalog definitions/privilege booleans only. Run in
the application's actual role and connection settings; privileged migration-role
results alone do not prove runtime permissions. Repeat for the migrator only to
check consistent schema resolution and required creation/reference privileges.
Read-only transactions reject application-table DML and DDL; this script also
contains neither. [PostgreSQL transaction access mode](https://www.postgresql.org/docs/current/sql-set-transaction.html)

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '10s';
SELECT current_setting('server_version_num') AS server_version_num,
       current_setting('search_path') AS search_path,
       current_setting('default_transaction_isolation') AS default_isolation,
       current_schema() AS creation_schema,
       current_schemas(false) AS visible_schemas,
       pg_is_in_recovery() AS is_replica;

WITH names(name) AS (VALUES
 ('hero_auction_wallets'), ('hero_auction_user_profiles'),
 ('hero_auction_commanders'), ('hero_auction_admin_accounts'),
 ('hero_auction_diamond_wallets'), ('hero_auction_upgrade_receipts'),
 ('hero_auction_diamond_ledger'), ('hero_auction_diamond_exchanges'),
 ('hero_auction_diamond_registrations'), ('hero_auction_diamond_signup_receipts'),
 ('hero_auction_login_reward_receipts'), ('hero_auction_login_reward_streaks')
), resolved AS (
 SELECT name, to_regclass(name) AS oid FROM names
)
SELECT r.name, n.nspname AS resolved_schema, c.relkind, c.relpersistence,
       c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege(c.oid,'SELECT') AS can_select,
       has_table_privilege(c.oid,'INSERT') AS can_insert,
       has_table_privilege(c.oid,'UPDATE') AS can_update,
       has_table_privilege(c.oid,'REFERENCES') AS can_reference,
       (SELECT count(*) FROM pg_trigger t
          WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS user_trigger_count,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count,
       (SELECT count(*) FROM pg_rewrite w WHERE w.ev_class=c.oid) AS rule_count,
       (SELECT jsonb_agg(jsonb_build_object(
          'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),
          'not_null',a.attnotnull,'identity',a.attidentity,
          'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid))
          ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
       (SELECT jsonb_agg(jsonb_build_object(
          'type',k.contype,'definition',pg_get_constraintdef(k.oid,true),
          'validated',k.convalidated,'deferrable',k.condeferrable,
          'initially_deferred',k.condeferred,
          'enforced',coalesce((to_jsonb(k)->>'conenforced')::boolean,true))
          ORDER BY k.contype,k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
       (SELECT jsonb_agg(jsonb_build_object(
          'definition',pg_get_indexdef(i.indexrelid),
          'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique)
          ORDER BY i.indexrelid)
        FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
FROM resolved r LEFT JOIN pg_class c ON c.oid=r.oid
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY r.name;

-- Detect shadow/duplicate relations in other schemas, without reading rows.
SELECT n.nspname AS schema_name,c.relname,c.relkind,
       pg_table_is_visible(c.oid) AS visible
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname IN (
 'hero_auction_wallets','hero_auction_user_profiles','hero_auction_commanders',
 'hero_auction_admin_accounts','hero_auction_diamond_wallets',
 'hero_auction_upgrade_receipts','hero_auction_diamond_ledger',
 'hero_auction_diamond_exchanges','hero_auction_diamond_registrations',
 'hero_auction_diamond_signup_receipts','hero_auction_login_reward_receipts',
 'hero_auction_login_reward_streaks')
ORDER BY c.relname,n.nspname;

-- Run this last query only when the metadata above confirms ledger + id exist.
WITH serial AS (
 SELECT pg_get_serial_sequence('hero_auction_diamond_ledger','id') AS sequence_name
)
SELECT sequence_name,
       has_sequence_privilege(sequence_name,'USAGE') AS can_nextval,
       has_schema_privilege(current_schema(),'USAGE') AS schema_usage,
       has_schema_privilege(current_schema(),'CREATE') AS schema_create
FROM serial;
ROLLBACK;
```

Expected missing foundation tables **before** first application are not a reason
to invent zero balances or enable flags. Existing mismatched tables are a hard
stop: do not drop/recreate them or “fix” production via `IF NOT EXISTS`. Compare
the definitions against a fresh approved test schema, not unstable OIDs or the
spelling of autogenerated constraint names. Missing sequence access blocks
upgrade ledger inserts; table grants do not grant sequence access. `FOR UPDATE`
also needs suitable UPDATE privilege. [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html)

For PostgreSQL 18, `conenforced` must be true; the JSON lookup above stays compatible
with older supported versions that do not have that catalog column. Confirm the
actual supported server version before executing the script.

## Execution, partial application, and rollback

Each migration already contains its own `BEGIN`/`COMMIT`. Execute each exact file
in one session, stop on the first error (`psql -X -v ON_ERROR_STOP=1 -f <file>`
with an already approved connection), and check its success/catalog result before
the next file. Establish approved timeouts for that migration connection first.
Do not put these files under an outer `--single-transaction` and assume four-file
atomicity: inner transaction controls defeat that assumption.
[PostgreSQL psql transaction behavior](https://www.postgresql.org/docs/current/app-psql.html)

- Failure before a file's commit rolls back that file's DDL; earlier committed
  files remain. With a pooled Node client, issue ROLLBACK and release/discard the
  errored client rather than returning an aborted transaction to the pool.
- Lost COMMIT response is **unknown**, not proof of rollback. Inspect catalog
  state on a new approved connection before retrying. Resume only after exact
  compatibility is established. DDL idempotency is not schema verification.
- After any real award/spend, preserve all wallets, registrations, receipts,
  streaks and ledgers. Removing a receipt can reopen eligibility or make an
  uncertain spend unrecoverable. Disabling flags is a service kill switch, not
  reversal of committed currency. Do not drop tables, reset streaks, subtract
  awards, or replay grants as a rollback shortcut.
- Disable individual signup/login/exchange flags to stop those actions. Turning
  the main diamond flag off additionally restores gold-only 21+ upgrade pricing;
  that economic behavior needs its own incident decision. Old requests remain
  journaled for recovery when their approved feature returns.
- Flags are read at process startup. A rolling fleet can briefly disagree on
  upgrade prices/eligibility, so coordinate one consistent authorized rollout;
  do not claim a flag changed merely because one instance restarted.

## Real PostgreSQL verification plan (isolated fixtures only)

The official PostgreSQL 18 GitHub Actions service is the approved test route.
Local package installation/cluster setup and all production database operations
remain outside this authorization. Do not reuse `DATABASE_URL` implicitly; use
the separate explicit disposable target guarded by the harness below.
The existing `pg` dependency can run the real exported service functions without
starting the production HTTP server or contacting Google.

1. **Fresh + repeat schema:** seed only the four minimal baseline tables with
   synthetic IDs; execute exact 001–004; rerun each; compare normalized catalogs
   before/after and assert no fixture currency changed. Separately precreate an
   intentionally incompatible table and confirm the preflight rejects it even
   though `CREATE IF NOT EXISTS` does not. Record server version + file hashes.
2. **Actual constraints:** use a fresh transaction/SAVEPOINT per rejected insert.
   Assert SQLSTATE 23505 for duplicate receipt keys, 23503 for missing parent or
   mismatched streak day, and 23514 for wrong day-7 amount/extra gold, negative
   wallets, and broken balance equations. Confirm invalid SQL did not commit.
3. **Real service calls:** `Promise.all` at least 12 `claimLoginReward` calls through
   separate pool connections for one synthetic Google account/date. Exactly one
   non-replay, +100 gold once, one receipt/streak. Use two accounts to prove no
   receipt leaks. Exercise guest/CG/Apple rejection without mutation.
4. **Cross-operation locks:** run the real claim, upgrade and exchange services
   concurrently (multiple start orders), with enough synthetic funds. Check
   exact net deltas, one receipt per accepted request and no deadlocks. Hold a
   profile row in another transaction to establish actual blocking/release; hold
   gold separately to verify cross-operation serialization.
5. **Calendar/cycle:** PostgreSQL-convert fixed timestamptz values just before/
   at UTC21:00 to Istanbul dates, including month/year/leap-day boundaries. Use
   synthetic prior-date receipts/streaks relative to the DB's actual today to
   test day7=5/no gold, day7→1, missing-date reset and regression rejection.
   A controlled test-only clock-query adapter may drive 14 days and lock-wait
   boundary cases; label it as controlled-time testing, not elapsed wall time.
6. **Failure/unknown outcome:** inject an exception before each write stage and
   verify the real PostgreSQL rollback. Forward COMMIT to the DB, then deliberately
   throw at the adapter to model a lost response; reconnect and retry the same
   account/date or request ID, with no second credit/debit. Never switch to a new
   day/key automatically. Recreate the pool to prove no process-memory dependency.
7. **Welcome + campaign:** newly registered fixture gets welcome10 once and
   day1gold100 independently; existing fixture gets no retroactive welcome but
   can claim day1; profile/wallet concurrent-first-login conflict cannot mint twice.
8. **Durability + readiness:** if authorized, restart only the disposable cluster
   and check balances/receipts survive and retry safely. Test runtime-role grants,
   missing schema, overflow, corrupt-state rejection, flags-off no writes, and
   no checkout/ad availability. Report failed, skipped and actually run tests
   separately; no unit/model result substitutes for this gate.

Source review found no new schema/service mismatch in 001–004. These operational
and real-database gates remain prerequisites, not evidence that activation has
already succeeded. The historical `003` comment calling welcome the “only” free
exception predates 004; its SQL is still correctly limited to welcome10. Payment
provider readiness is required for **sales**, not for a separately approved free
campaign; activation documentation must keep those two decisions distinct.

## Approved disposable CI implementation

An official `postgres:18` service **inside GitHub Actions** is authorized
for this test only. `.github/workflows/economy-postgres-tests.yml` uses an ephemeral
Ubuntu runner, read-only repository permissions, no repository secret references,
a health check, and a 15-minute ceiling. This route is separate from production
and does not authorize accessing or modifying Render data. The official major-18
image is pinned to the digest actually exercised by the first isolated run; each
run records its PostgreSQL version and migration SHA-256 hashes. [Official image](https://github.com/docker-library/docs/tree/master/postgres)

`tools/test-postgres-economy.mjs` requires the exact explicit fixture target
`HERO_ECONOMY_TEST_DB=postgresql://test:test@127.0.0.1:5432/hero_economy_test`.
It rejects any nonempty `DATABASE_URL`, alternate host/role/database/password/port,
or a nonempty database before setup. Pool connection settings are fixed explicitly;
there is no credential fallback, table reset, or production-server bootstrap.
Only synthetic IDs are inserted. The failure test removes only its own temporary
trigger/function; it does not drop wallet tables or erase existing databases.

Prepared coverage uses actual exported services and SQL: exact schema/reapplication,
validated PK/FK/CHECK constraints, calendar conversion, 12 parallel claims, day7,
cycle/gap, old receipt and lost-COMMIT recovery, trigger-induced transaction rollback,
actual lock blocking, combined upgrade/exchange/claim locks, welcome/new-vs-old
eligibility, unavailable providers, dates, flags, and overflow. The harness logs
specific limitations: no physical cluster restart, production privileges/backups,
provider integration, or naturally elapsed midnight passage is established.

Local JS syntax, YAML parsing, and six refusal-path checks passed (missing opt-in,
remote host, wrong database, wrong role, nonempty DATABASE_URL, query override). A real PostgreSQL pass may be stated
**only after the exact published commit's CI job terminates successfully**. This
review has not run or connected to PostgreSQL locally.

### First real-database result

PR47 head `d907e8e58dd089a34a17e74691c3fcc359937ad6` passed all **12**
real PostgreSQL integration groups on PostgreSQL **18.6**.
[Run 40244930411](https://github.com/mehmetakgul91-cloud/hero-auction/actions/runs/40244930411).
The workflow is now pinned to that run’s official image digest; its final release
head must pass again. This does not satisfy production preflight or authorize
production migration/activation, and does not claim a physical restart test.
