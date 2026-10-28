Android test build synchronized with game commit f986111af571416da8043e820c3a264e7960375b (24 October 2026).

- Automatic five-hero placement and persistent front/back choices.
- Reliable remaining-card reveals and recovery if the live stream disconnects.
- Three current arena music tracks, plus the existing fallback, packaged locally.
- All 50 hero and four commander portraits retained; optimized Android images keep the download below 30 MB.
- Actual Android 15 emulator coverage: guest login, commander selection, bot auction, card portraits, formation, Ready, arena actions, background/resume and match result.
- Every bundled file is checked by SHA-256 after APK assembly.

This is the isolated guest-only test game; it uses the commander test server and temporary progress. It does not connect to production accounts. A physical phone has not been tested. The test backend can need time to wake from sleep.

The previous debug signing key was not retained. If Android rejects this update, remove the old Hero Auction Test app first (its local test session is erased), then install this APK.
