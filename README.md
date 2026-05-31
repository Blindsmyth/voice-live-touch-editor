# Voice Live Touch Editor

Standalone macOS editor for the TC-Helicon **Voice Live Touch**, using MIDI SysEx. This repository is a proof of concept controlling **Harm Vol** (`Mixer_L Level Harmony`, parameter ID **193**). The architecture supports a future full editor and optional web build.

## Requirements

- macOS with **Node.js 20+** and npm

If `npm` is not found, install Node via Homebrew:

```bash
brew install node
```

Ensure `/opt/homebrew/bin` is on your PATH (Apple Silicon). Then open a **new terminal** tab.
- Voice Live Touch connected via USB
- MIDI enabled on the device
- SysEx ID on the unit matching the app (default **0**, set under device MIDI/setup → `Utility SysEx_ID`)

## Quick start

```bash
npm install
npm run dev
```

Click **Connect MIDI**, choose the Voice Live Touch **output** port, and use the Harm Vol slider. On connect (and **Refresh**), the app requests the current value; moving the slider sends updates to the device.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Electron app with hot reload |
| `npm run build` | Production build (`apps/desktop/out`) |
| `npm run dist` | Build macOS `.dmg` / `.zip` (electron-builder) |

## Project layout

```
packages/core/     SysEx pack/unpack, Harm Vol parameter definition
apps/desktop/    Electron + React UI (Web MIDI)
docs/              SysEx manual (PDF + Markdown)
examples/          Reference Axoloti / Max editors
```

## MIDI troubleshooting

- **No outputs listed** — Check USB cable, power, and that the device exposes a MIDI port to macOS (Audio MIDI Setup).
- **Slider moves but device unchanged** — Verify **SysEx ID** matches the value in the device menu (0–127). Wrong ID is ignored by the unit.
- **No readback on connect** — The app opens MIDI **input** ports explicitly (required for Web MIDI receive). Check the “MIDI input (listening)” line matches your device. Try **Refresh**. Enable **Editor Mode** is sent automatically on connect so the unit echoes parameter changes.
- **SysEx permission** — The app requests `sysex: true` on Web MIDI; use the system prompt when connecting.

## Protocol reference

See [docs/VoiceLive-Touch-Sysex-Manual.md](docs/VoiceLive-Touch-Sysex-Manual.md) for message formats and the full parameter tables.

Harm Vol uses message `0x22` (set) and `0x47` (request), matching the reference patch in `examples/Voice Live Touch Sysex Editor.axp`.

## License

Documentation © TC-Helicon (see PDF manual). Application code: use and modify as needed for personal/editor tooling.
