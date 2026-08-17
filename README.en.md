<!-- markdownlint-disable MD033 MD041 -->

<p align="center">
  <img src="assets/icons/icon-large.png" alt="Photofield" width="120" />
</p>

<h1 align="center">Photofield for webOS</h1>

<p align="center">
  <strong>Native <a href="https://github.com/SmilyOrg/photofield">Photofield</a> client for LG webOS TVs</strong><br />
  Photofield auto-discovery · collection browsing · slideshow · video playback · Lofi background music
</p>

<p align="center">
  <a href="README.md"><b>中文</b></a>
  &nbsp;·&nbsp;
  <b>English</b>
</p>

<p align="center">
  <a href="https://github.com/CheerChen/photofield-webos/stargazers"><img src="https://img.shields.io/github/stars/CheerChen/photofield-webos?style=flat&logo=github" alt="Stars" /></a>
  <a href="https://github.com/CheerChen/photofield-webos/releases"><img src="https://img.shields.io/github/v/release/CheerChen/photofield-webos?include_prereleases&label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/webOS-TV-a50034?logo=lg&logoColor=white" alt="webOS" />
  <img src="https://img.shields.io/badge/root-not%20required-2ea44f" alt="No root" />
  <img src="https://img.shields.io/badge/Photofield-server%20required-blue" alt="Photofield server" />
  <img src="https://img.shields.io/badge/language-JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

| Source selection | Collections | Photo grid |
| :---: | :---: | :---: |
| ![Source selection](assets/screenshots/01-sources.webp) | ![Collections](assets/screenshots/02-collections.webp) | ![Photo grid](assets/screenshots/03-grid.webp) |
| ![Fullscreen viewer](assets/screenshots/04-viewer.webp) | ![Kiosk slideshow](assets/screenshots/05-kiosk.webp) | ![Settings](assets/screenshots/06-settings.webp) |

---

## What this is

A **purpose-built webOS TV client** for [Photofield](https://github.com/SmilyOrg/photofield) — not a browser wrapper.

- Talks to a self-hosted Photofield instance: auto-discovers photo sources, browses collections, views photos fullscreen
- TV UI with remote D-pad focus navigation
- Kiosk slideshow mode: configurable interval, fit and order
- Dual-source Lofi background music: 28 bundled offline tracks or live radio streams
- Photos and videos both use native system decoding — **no root required**

The client ships empty: **no built-in photo sources**. Photos and videos come from your own Photofield instance.

See [Releases](https://github.com/CheerChen/photofield-webos/releases) and [CHANGELOG.md](CHANGELOG.md).

---

## Features

| Capability | Details |
| --- | --- |
| Auto discovery | Scans the ports of the configured Photofield server |
| Collection browsing | Four-column cover cards; subdirectories expand into separate collections |
| Photo grid | Follows the server-side wall layout; start slideshow playback from any photo |
| Video playback | Viewer and slideshow stream the untouched source with sound |
| Slideshow playback | Configurable interval, fit mode and order |
| Lofi background music | Two sources: 28 bundled offline tracks, or 13 live radio stations grouped into four colour themes; colour keys switch themes, up/down keys change station |

---

## Requirements

1. **An LG webOS TV** (Developer Mode or Homebrew Channel; root not required)
2. **A deployed Photofield instance** (serving your photos and videos)
3. Network reachability between the TV and the server (same LAN or an accessible host)

Server setup: [Photofield](https://github.com/SmilyOrg/photofield)

---

## Installation

### Developer Mode / manual sideload

Download a built IPK from [Releases](https://github.com/CheerChen/photofield-webos/releases) and install it with LG's official `ares-install`.

**Rooted TVs (opkg path, works around appinstalld unpacking failures):**

Replace `TV` below with the TV's LAN IP, or a host configured in `~/.ssh/config`.

```bash
scp com.cheerchen.photofield_*_all.ipk root@TV:/tmp/photofield.ipk
ssh root@TV 'opkg --add-dest developer:/media/developer install -d developer /tmp/photofield.ipk && \
          mkdir -p /media/developer/apps/usr/palm/applications/ && \
          cp -a /media/developer/usr/palm/applications/com.cheerchen.photofield \
                /media/developer/apps/usr/palm/applications/'
ssh root@TV 'sync; reboot'   # a reboot is required on first install so sam registers the app
```

Or package locally (initialize the [webos-tv-kit](https://github.com/CheerChen/webos-tv-kit)
submodule first — the CDP debug tooling lives there too):

```bash
git submodule update --init   # once after cloning
npm ci
./scripts/package.sh
# → com.cheerchen.photofield_<version>_all.ipk
```

---

## Quick start

1. Install and open **Photofield**
2. The app scans ports `8000–8010` on the configured server automatically; the default server address is `192.168.0.110` — change it and rescan in Settings
3. On the source screen, move with the D-pad, OK to browse, play key or green key to play the whole source
4. Inside a collection, OK opens the grid, OK again enters the fullscreen viewer
5. During kiosk playback, use colour keys to toggle Lofi music and media keys to control playback

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | webOS Web App (WAM / Chromium) |
| Language | Vanilla JavaScript (native browser ESM); no runtime third-party dependencies |
| UI | Remote focus navigation + stack-based screen routing |
| Image loading | Ordered candidate fallback + decoded-size budget |
| Playback | Native `<video>` hardware decode |
| Service protocol | Photofield HTTP API (scene / file endpoints) |
| Local data | `localStorage` (settings, PIN, source cache) |
| Packaging | `ares-package` → IPK |

---

## Development

```bash
# install development dependencies
npm ci

# ESLint + unit tests
npm run check

# Playwright end-to-end tests
npm run test:e2e

# build the IPK (requires ares-cli)
./scripts/package.sh
```

---

## Related projects

- [Photofield](https://github.com/SmilyOrg/photofield) — server / web UI
- [open-lofi](https://github.com/btahir/open-lofi) — source of the bundled kiosk Lofi tracks (CC0 public domain)
- [lofi-radio-web](https://github.com/88lin/lofi-radio-web) — station curation reference for the live radio source
- [webosbrew](https://github.com/webosbrew) — webOS community tools and app repository

---

## Disclaimer

- This project is a client shell and **ships with no photo or video content**
- You must deploy Photofield yourself and lawfully manage your own media library, at your own risk

---

## License

MIT. Upstream Photofield and third-party dependencies follow their own licenses.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CheerChen/photofield-webos&type=Date)](https://star-history.com/#CheerChen/photofield-webos&Date)
