# ENKA Mail Merkezi

Single-account, review-before-send SMTP app. Deploy this independent `enka-mail` branch only. It does not run the Hero Auction game.

## Run

Node 22–24; `npm ci`, `npm test`, then `npm start`.

Required environment: `SMTP_HOST`, `SMTP_PORT` (587 or 465), `SMTP_USER`. Optional `SMTP_FROM_NAME`. In production set `NODE_ENV=production` and use Render's `RENDER_EXTERNAL_URL` or an explicit HTTPS `APP_ORIGIN`. HTTP server binds to `0.0.0.0:$PORT`; `/healthz` is a side-effect-free health endpoint.

The operator enters the mailbox password in the HTTPS form. SMTP requires TLS 1.2+ with certificate validation; no plaintext fallback. The password is held only in process memory for a maximum six-hour session. There is no stored password, open relay, arbitrary SMTP host, attachment/URL fetching, automatic send, or automatic retry. All messages require an immutable preview then an explicit send. Per-process send limit: 10/hour; login limit: 8/15 minutes.

SMTP acceptance does not confirm inbox delivery. Ambiguous SMTP failures are marked unknown and never retried automatically. Double submissions of a draft are idempotent; repeated content is blocked for 24 hours within the same running process. Restarting loses sessions, draft/receipt history, and deduplication state. Export receipts before logout. This release intentionally does not claim durable CRM history or scheduled background sending.

Run one service instance. Do not scale horizontally without shared sessions, durable send claims, and shared rate limits. Do not deploy while a send is pending. Add durable storage with explicit approval before introducing CRM or unattended scheduling.

## Sent-folder copies

Accepted messages are appended over strict TLS IMAP (port 993, `IMAP_HOST` defaults to `SMTP_HOST`) using the existing session password. The identical RFC 822 message and Message-ID are used for SMTP and IMAP. A unique existing Sent folder is discovered from special-use flags/names; ambiguous or missing folders fail visibly instead of guessing or creating folders.

IMAP failures never change an accepted SMTP result and never trigger SMTP retries. The archive-only retry searches by Message-ID first, so a lost APPEND response does not create another copy. Previous exported accepted receipts can be imported for archive-only actions, retaining original date and Message-ID. No password, raw message, or credentials are exported. IMAP errors and message contents are not logged.

The authenticated panel reports the remaining rolling-hour allowance and next available slot in Turkey time. The 10/hour cap is unchanged. Importing a receipt does not send mail or consume quota. Restarting still loses the in-memory send ledger; never restart to bypass the hourly limit.
