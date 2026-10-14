# Offline character art

Marvel, DC and Tolkien card images must be real, correctly identified, and reusable under the stated license. Do not use AI-generated images or scrape copyrighted comics/movie posters.

1. Find a suitable file on Wikimedia Commons and verify that it actually depicts the intended character. A search result alone is not proof.
2. Check the image's license on its Commons file page. This downloader accepts CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0 and Public Domain; other licenses require separate review.
3. Add a card ID to `tools/offline-art-manifest.json` with `approved: true`, `downloadUrl` (direct upload.wikimedia.org URL), `sourcePage` (Commons file page), `license`, and `attribution`.
4. Run `node tools/download-approved-art.mjs`. The script verifies file signatures and sizes, downloads locally, and updates `public/cards.json`.
5. Commit the downloaded files, the manifest and the cards JSON together. Test offline by blocking internet access in the browser.

Never approve a photo of an actor as the comic character without an explicit character depiction. Do not confuse lookalike names across universes. Wikimedia Commons results may be scarce for copyrighted characters.
