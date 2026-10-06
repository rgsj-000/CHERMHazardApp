# CHERM interface direction

Applied the local UI/UX Pro Max skill to the existing offline GIS workspace.
Its search suggested a minimal, data-focused dashboard; the suggested marketing
page patterns do not fit this app, so the implementation keeps the interactive
map and scenario controls as the main workspace.

- Dark teal header, light surfaces, restrained borders, and a single primary Run action.
- System fonts and bundled runtime assets keep the interface usable offline.
- Three steps: choose an area, adjust the scenario, generate results.
- Uploads, basemap configuration, forest settings, and logs use native disclosures.
- Area and flood-period labels describe the data currently displayed on the map.
- Model status and coverage remain visible; missing flood coverage preserves available landslide results.
- Input labels, visible focus, keyboard disclosures, accessible progress, and reduced motion.
- Desktop split workspace; smaller screens use a single column with links between controls and map.

Verification: Node tests and `tools/verify-dataset.mjs`, including real scenarios,
375/768/1024/1440 px layouts with all upload disclosures open, a 1280×600 px full-result
map without overlapping controls and legends, keyboard interaction,
and screenshots in `docs/verification/`.
