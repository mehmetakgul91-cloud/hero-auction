# Paid-entry pause and drain (release prerequisite)

This control does **not** enable diamonds, dust, chests, login rewards, exchanges,
welcome bonuses or purchases. Its default is open: no environment value or saved
pause means existing behavior. A first feature-OFF deployment is staged release
instrumentation, not full economy activation.

## Existing administrator interface

Use the existing signed-in `/admin` session. The maintenance panel reads status;
pausing and resuming each require an explicit confirmation. No new credential,
token-paste flow, public admin endpoint or permission is introduced.

- POST `/api/admin/economy/status`: existing admin body-token authorization.
- POST `/api/admin/economy/pause`: same authorization plus boolean `paused`, the
  latest `expectedBootId` and `expectedRevision` from status. A stale boot or
  revision is rejected; refresh rather than replaying an old resume command.
- A separate `hero_auction_social` row, `economy-maintenance`, holds versioned
  pause state. There is no new DDL or automatic migration. The global social row
  is not overwritten by maintenance commands.
- `HERO_PAID_ENTRY_PAUSED=1` additionally closes admission at boot. Environment-only
  closure is not reported durably confirmed until an admin pause is persisted.

Pause closes new paid joins, matchmaking and player rematches immediately;
previously admitted work may finish. Existing battles, read-only views and bot
training remain available. Queued invitations wait; already committed invitation
receipts may recover without another debit. Unsettled paid rooms are not expired
to manufacture a zero count.

## What a green status means

`ready` requires a confirmed persistent pause, a fresh DB health read, and zero
active paid matches, pending gold/chests, admission/control operations, room
write batches (including queued writes/deletes and overlaps), relevant dirty
rooms, social operations, unconfirmed social snapshots and uncertain entries.
Counts are conservative, not balances. No account identifiers, secrets or player
wallet amounts are returned. UI errors invalidate the previous proof.

**This is evidence for the reported boot only, not a distributed drain proof.**
Before cutover the operator must independently confirm a single current serving
instance, no overlapping old/new deployment and the expected boot identifier.
A fresh `SELECT 1` cannot observe another process's memory. The first deployment
cannot retroactively prove the old, uninstrumented process had no pending work.
Do not infer that absent historical counters mean historical work was settled.

After an explicitly approved runtime pause, keep that same boot alive until all
counters are clear and persistent writes are confirmed. Keep the saved pause
through the separately approved migration/feature deployment. Observe its new
boot and paused state before a separately approved resume. Neither this document
nor a green status authorizes migration, flags, deployment or player interruption.

Legacy direct paid admission predates durable entry receipts. An observed lost
COMMIT response now closes admission and latches an uncertainty blocker; the
control never invents a debit, refund or rollback. This blocker has no automatic
clear endpoint. If persistence cannot be confirmed, or active matches never
complete, stop and investigate: do not clear rows/counters, delete rooms, restart
to erase evidence, or assume rollback. Durable entry redesign/reconciliation is
outside this small release-control patch.

## Checks

`tests/paid-entry-maintenance.test.mjs` covers persistence errors, restart reads,
lost-response retry, concurrent controls, stale boot/revision, fail-closed
uncertainty, full room batches, social enqueue/failure and admin UI state. Existing
invitation/entry/moderation regressions cover the new dependency. Actual
PostgreSQL restart/control assertions live in the dedicated disposable-DB harness;
passing local mocks does not substitute for that CI result.
