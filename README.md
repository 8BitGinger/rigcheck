# RigCheck — Broadcast Studio Readiness Console

RigCheck is a lightweight, read-only local **Node.js** web dashboard for verifying podcast and broadcast studio readiness before going live or recording. It monitors your active switcher (**OBS** or **vMix**), **RØDECaster Pro**, **Custom OBS Docks**, **Stream Deck**, **PC Health (CPU / RAM / GPU)**, and **active local ports/processes** with minimal CPU overhead.

## Features (v1 MVP — Strictly Read-Only)
- **Top-Level Switcher Selector (`OBS` default | `vMix`)** with instant **READY / NOT READY** status and dual-switcher conflict detection (`obs64.exe` + `vMix64.exe` running simultaneously).
- **Overall Studio Readiness Banner:** Requires the active switcher, RØDECaster Pro, all configured Custom OBS Docks, and Stream Deck to be `READY`.
- **Low-Overhead Telemetry:** Event-driven OBS WebSocket v5 client, staggered OS polling intervals (2.5s / 5s / 8s), Server-Sent Events (SSE), and automatic UI pause when the browser tab is hidden.
- **Port & Process Inspector:** Quickly verify listening studio ports and PIDs without opening a terminal.
- **Corporate Demo Mode:** Built-in `Live` / `Demo: All Ready` / `Demo: Fault State` selector for executive walkthroughs.

## Quick Start (Windows)
1. Install Node.js (v18+ recommended).
2. Edit `config.json` to set your OBS WebSocket password, vMix URL, and custom dock endpoints.
3. Double-click **`start-rigcheck.bat`** — it will automatically install dependencies if missing (or skip if already installed), start the local Node.js server, and open `http://127.0.0.1:3100` in your default browser.

### Manual Start
```bash
npm install
npm start
```
Then open `http://127.0.0.1:3100` in Chrome or Edge (standalone browser window).

## Future Development
- **Active Studio Controls (v2):** Safe, opt-in control actions such as one-click OBS WebSocket reconnects, restarting unresponsive custom dock services, and pre-show audio/test triggers.
- **Blackmagic DeckLink SDK Helper:** Pluggable lightweight CLI helper (C++ DeckLink SDK) outputting JSON signal-lock and input format telemetry (`1080p59.94`, HDMI/SDI lock state) for Blackmagic capture cards.
- **Multi-Studio Profiles:** Shareable studio preset profiles and exportable JSON/HTML pre-flight reports for deployment across multiple studios.
