# Hero Auction — CrazyGames Basic Launch

Submission entry URL after deployment: https://heroauction.com.tr/crazygames/
Technology: HTML5 / JavaScript, Node.js server, PostgreSQL, real-time multiplayer.
Submit as externally hosted game; this is not a standalone ZIP because game logic and accounts run on the server.

Implemented:
- Separate platform route; no Google login or AdSense scripts in returned HTML.
- Verified CrazyGames account login through SDK getUserToken() and server-side RS256 verification against the provider public key. Guest play remains available when the portal has no signed-in account.
- Isolated browser keys for portal guest login, room, formation and settings.
- SDK v3 init with timeout/network-failure fallback; only call enabled SDK environments.
- Loading and auction/formation/battle gameplay signals; muteAudio and disableChat handling.
- Internal navigation remains on platform route, including arena return/rematch.
- Basic Launch hides rewarded-ad UI and does not request advertisements or credit gold.

Before submission:
1. Open the URL after deployment; test mobile auction → formation → arena → rematch with real server/database.
2. In developer.crazygames.com create the game; use the hosted URL and run their preview/QA tool.
3. Provide game covers/screenshots and distribution-rights information; accept developer terms as account owner.
4. Verify iframe loading, SDK recognition and initial transfer size in the portal preview.

Account and multiplayer implementation:
- Provider-signed gameId and userId map to a stable game-scoped account ID in the existing PostgreSQL wallet, commander and social systems. A new login on another device loads the same records. No browser balance or user ID is trusted.
- CRAZYGAMES_GAME_ID can optionally pin the expected game ID once assigned by the portal. Even before pinning, game namespaces are distinct and tokens for another game cannot access this game's accounts.
- Refresh identity on every application/arena load; SDK auth listener clears the old seat and re-enters verified login. Device-local login does not choose the current CrazyGames account.
- A new CrazyGames account starts with its own progress; existing guest/Google progress is not automatically merged.
- SDK updateRoom/leftRoom report joinability, inviteLink supplies platform URLs, inviteParams and addJoinRoomListener join the correct room, and isInstantMultiplayer creates a private two-player room. Full/missing rooms show an error without destroying the current seat. Rematches keep the existing room.
- New invite/instant entries can enter the room without the commander onboarding screen; first-time commander selection remains available on returning to the main menu.
- Concurrent joins are guarded during wallet payment; a room can admit only one opponent. Account IDs must match room seats for actions and event streams.

Validation:
- node --test tests/crazygames-*.test.mjs covers 21 cases including real HTTP server account login with test-signed RSA tokens, a second device restoring commander/wallet state, identity separation, concurrent invite joins and invalid tokens. The test process substitutes only the provider public key; production has no test-key setting or authentication bypass.
- Portal preview with real provider accounts and two-player end-to-end play is still required before claiming provider QA is passed.

Full Launch advertising is not enabled. After selection, implement a server-controlled reward flow. SDK ad completion is a client event, not a provider-signed payment receipt. Do not enable live gold claims by trusting a browser boolean. The existing /api/rewarded/claim remains disabled.

References: https://docs.crazygames.com/requirements/intro/ ; https://docs.crazygames.com/requirements/account-integration/ ; https://docs.crazygames.com/sdk/intro/
