# Voice Live Touch Editor

Open-source macOS editor for the TC-Helicon **Voice Live Touch** (v1), using MIDI SysEx. Inspired by the commercial [VoiceLive Touch Editor](https://www.voiceliveeditor.com/index.php/editors) on VoiceLiveEditor.com, built with Electron + Web MIDI so a future web build can share the same core.

## Features

- **334 SysEx parameters** — 225 preset (live step) + 108 system/setup
- Grouped sidebar (Harmony, Mixer, Delay, Reverb, …)
- Search by name, label, or ID
- Bidirectional edit: slider sends `0x22`, refresh requests `0x47`
- Preset request (`0x45` preset 0) and notification parsing (`0x34`)
- Debug hex view for MIDI troubleshooting

## Requirements

- macOS with **Node.js 20+** and npm (`brew install node`)
- Voice Live Touch on USB, MIDI enabled
- SysEx ID matching the device setup menu (default **0**)

## Quick start

```bash
npm install
npm run dev
```

Connect MIDI → choose **Preset** or **System** scope → pick a group in the sidebar → edit parameters. Use **Refresh group** to read values from the device.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run generate` | Regenerate parameter tables from [docs/VoiceLive-Touch-Sysex-Manual.md](docs/VoiceLive-Touch-Sysex-Manual.md) |
| `npm run dev` | Electron dev with HMR |
| `npm run build` | Production build |
| `npm run dist` | macOS `.dmg` / `.zip` |

## Project layout

```
packages/core/       SysEx, MidiParameterService, generated parameter registry
packages/ui/         ParameterControl, ParameterPanel
apps/desktop/        Electron shell (EditorShell)
scripts/             generate-parameters.mjs
docs/                SysEx manual (MD+PDF), user manual (MD+PDF)
examples/            Reference Axoloti / Max editors
```

## Documentation

- [VoiceLive-Touch-Sysex-Manual.md](docs/VoiceLive-Touch-Sysex-Manual.md) — protocol and parameter IDs
- [VoiceLive-Touch-User-Manual.md](docs/VoiceLive-Touch-User-Manual.md) — device UI context (German source PDF)

## MIDI troubleshooting

- **No outputs** — check USB and Audio MIDI Setup
- **Send works, no readback** — confirm MIDI **input** port; try Refresh group
- **Wrong values** — verify SysEx ID matches device (`Utility SysEx_ID`, system param 858)
- Enable **Debug hex** to compare with [examples/](examples/)

## Preset transfer (basic)

**Request preset** sends SysEx preset request for slot **0** (current edited step per manual). Full preset dump/load (`0x20`/`0x21` streams) is planned for a later release; notifications are already parsed.

## License

SysEx documentation © TC-Helicon. Application code: use and modify for personal/editor tooling.
