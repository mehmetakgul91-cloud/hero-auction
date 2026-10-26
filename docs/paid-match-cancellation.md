# Explicit cancellation of three abandoned paid matches

This is an administrator-only recovery operation, not an automatic timeout or a
new reward. It requires explicit operator approval for the exact three original
match identities. It must not be used to manufacture a green migration drain.

## Financial and identity boundary

- Select exactly three unchanged, finished-auction, unresolved paid matches.
  Bot rooms, active combat, completed results, existing win/refund awards,
  pending chest work and uncertain joins are ineligible.
- Legacy admission has no independent debit receipt. Its server-owned
  `entryPaid=true` is set only after successful entry transaction completion.
  Both existing, distinct account wallets and the original match identity must
  also be present. Do not reconstruct a missing debit or create a missing wallet.
- Refund 50 gold to each of the two paid seats, using the existing canonical
  per-match/per-seat refund award IDs. The client cannot choose the amount.
- All six refunds, wallet changes, room cancellation snapshots, admin audit
  entries and the durable batch receipt are one transaction. A failure rolls
  back the whole batch. An uncertain COMMIT is reconciled using the same exact
  selection; never retry with a newly invented request or infer a rollback.
- Cancellation is not a draw or a victory: no winner, chest, series increment,
  rating change or fabricated match-history record. Existing teams, history,
  ratings and balances outside the approved refunds are preserved.

## Normal administrator workflow

Use the existing signed-in `/admin` maintenance panel. First establish a
confirmed durable paid-entry pause on the current boot and revision. The
read-only preview returns opaque immutable-match IDs and state digests, not
player tokens or account identifiers. Compare those IDs with the previously
approved originals, explicitly select all three, and confirm the displayed
refund total. A changed digest, boot, revision, lifecycle or durable record
requires new inspection; it is not permission to close a replacement match.

The server reserves the selected matches before asynchronous work, blocks their
battle preparation and competing mutation, and serializes the operation with
pause/resume. Existing room/social/award writes must settle before execution.
The single-boot restriction remains: independently verify no older deployment
or other server instance can still write these rooms.

If the response is lost, retain the same selection and use the panel's explicit
result reconciliation. Reloading is not a new refund authorization. A receipt
replay must not overwrite a newer rematch. Inspect the resulting audit/receipt
and fresh drain status before proceeding to schema installation.

## First-deploy bootstrap

The old uninstrumented server cannot honor the new in-app pause flag. When an
explicitly approved short **all-modes** outage is necessary, the existing paid
Render service's Maintenance Mode can temporarily reject public traffic while
keeping the internal service and Shell available. Recheck that no active combat
is interrupted; do not use deployment to terminate a match.

1. Finish exact-head tests and review; verify backup availability before outage.
2. Enable the existing provider maintenance switch and verify public503.
3. Save `HERO_PAID_ENTRY_PAUSED=1` without deploying the old code, then publish the
   reviewed code with all economy feature flags OFF.
4. Verify the expected new commit and boot, boot-paused admission, and complete
   retirement of the old instance before disabling provider maintenance.
5. Bot training can now reopen. Persist the in-app pause through existing admin
   controls, then perform approved cancellations and verify a fresh zero drain.
6. Keep that durable pause through the reviewed migration/activation deployment.
   Remove the temporary boot-only flag when appropriate, not the saved pause.
   Reopen paid admission only after new-boot/schema/feature checks succeed.

Provider maintenance affects **every** public route, including bot mode and the
admin page; its use requires explicit authorization beyond a paid-only pause.
It does not stop the running process or grant database permissions.
[Render maintenance documentation](https://render.com/docs/maintenance-mode),
[environment save options](https://render.com/docs/configure-environment-variables).

## Evidence

Unit tests cover admission/identity/refund safety. The dedicated disposable
PostgreSQL18 harness tests actual transaction rollback, idempotent replay,
lost-COMMIT recovery and authenticated HTTP boot/revision/digest boundaries.
Neither local mocks nor a provider-listed backup imply a restore test passed.
