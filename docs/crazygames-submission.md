# Hero Auction — CrazyGames Basic Launch

Submission entry URL after deployment: https://heroauction.com.tr/crazygames/
Technology: HTML5 / JavaScript, Node.js server, PostgreSQL, real-time multiplayer.
Submit as externally hosted game; this is not a standalone ZIP because game logic and accounts run on the server.

Implemented:
- Separate platform route; no Google login or AdSense scripts in returned HTML.
- Automatic guest authentication using existing signed server sessions.
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

Full Launch is not enabled. After selection, implement verified CrazyGames account-token mapping, account-change handling/cloud progress, multiplayer invites/room info and a server-controlled reward flow. SDK ad completion is a client event, not a provider-signed payment receipt. Do not enable live gold claims by trusting a browser boolean. The existing /api/rewarded/claim remains disabled.

References: https://docs.crazygames.com/requirements/intro/ ; https://docs.crazygames.com/requirements/account-integration/ ; https://docs.crazygames.com/sdk/intro/
