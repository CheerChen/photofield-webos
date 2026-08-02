# Changelog

All notable changes to this project are documented in this file.

## [0.4.0] - 2026-08-02

### Added

- Play videos in the viewer and kiosk: videos stream the untouched source with sound, fall back to the already-loaded preview when the browser cannot decode them, and suspend Lofi music until playback moves on to the next photo.
- Add red-key source rescan: triggers a Photofield filesystem reindex of the focused source, greys the card while scanning, and refreshes counts and clears the scene cache when done.
- Detect busy sources passively: a source mid-scan (even one started from the Photofield web UI) is greyed out and entry/playback is blocked until its indexing tasks finish.
- Add full IPv4 address entry in Settings.
- Add refreshed app icons and splash artwork, with SVG source files for regeneration.
- Show a short Lofi control hint when kiosk playback starts.
- Add a default-on Kiosk Lofi autoplay setting with shuffled color cycles.
- Expand each colour playlist to seven tracks and regroup them by visual theme.

### Changed

- Load images through an ordered fallback chain across grid, viewer, and kiosk: a missing pre-generated variant falls back to other variants or the server's dynamic preview instead of failing the slide.
- Serve originals directly for browser-decodable photos within a per-surface decoded-size budget, skipping variant requests; animated GIFs are never admitted as originals.
- Centralize kiosk launch and resume handling so every playback entry applies the same PIN gate and playback memory rules.
- Preserve cached sources when a discovery scan finds no reachable instances, and show an actionable empty state when no source is available.
- Cache recent photo metadata, defer scene creation, and preload kiosk images before crossfading.
- Render remote source and collection names as text nodes instead of HTML.
- Keep the viewer aligned with the latest navigation input while an image is loading.
- Display critical playback failures separately from routine notifications.

## [0.3.0] - 2026-08-01

### Added

- Automatically discover Photofield instances by scanning the configured host on ports 8000–8010, with cached results and manual rescanning.
- Add configurable kiosk photo fit modes: portrait ambience, contain, and cover.
- Add configurable kiosk playback order: shuffle or sequential.
- Add colour-key Lofi playlists with track navigation and an on-screen playback indicator.
- Inhibit the webOS screensaver while kiosk playback is active.

### Changed

- Improve source count refreshes and connection-failure feedback.
- Select image variants based on the target render size.
- Build slideshow collection counts in parallel and retry transient Photofield server errors.
- Stop slideshow playback after repeated server errors instead of retrying indefinitely.
- Remove generated IPK packages from version control.

## [0.2.0] - 2026-07-31

### Added

- Display collections as a four-column cover-card picker.
- Add inline SVG icons for webOS environments without suitable Unicode glyphs.
- Expand Wallpaper source subdirectories into separate collections.

### Changed

- Load collection covers sequentially to reduce server load.
- Correct fixed-height collection grid sizing to prevent cover clipping.

## [0.1.2] - 2026-07-31

### Changed

- Move kiosk playback controls from unreliable long-press OK handling to media keys.
- Support play, pause, rewind, fast-forward, and stop keys in kiosk mode.
- Temporarily remove the X source PIN lock and its settings entry.

## [0.1.1] - 2026-07-31

### Changed

- Use FLEX layout for denser photo grids.
- Prefer pre-generated image variants for grid previews.

## [0.1.0] - 2026-07-31

### Added

- Initial webOS photo client with source selection, collection browsing, photo grid, viewer, and kiosk slideshow modes.
- Photofield client adapter, remote-key navigation, persistent settings, PIN support, tests, and IPK packaging script.
