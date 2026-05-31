# Voice Live Touch Editor

Open-source macOS editor for the TC-Helicon **Voice Live Touch** (v1), using MIDI SysEx. Inspired by the commercial [VoiceLive Touch Editor](https://www.voiceliveeditor.com/index.php/editors) on VoiceLiveEditor.com, built with Electron + Web MIDI so a future web build can share the same core.

## Features

- **334 SysEx parameters** — 225 preset (live step) + 108 system/setup
- Grouped sidebar pages (Harmony, Mixer, Delay, Reverb, …) — **all parameters visible** on each page (no nested collapsibles)
- Human-readable enums (e.g. Harmony **Key** → C, C#, D…)
- Search by name, label, or ID
- Bidirectional edit: slider sends `0x22`, refresh requests `0x47`
- **Preset load/save** to device (`0x45` / `0x20` / `0x21`) with editable 15-character name
- **Local library** — workspace, timestamped backups, import/export `.vltpreset.json` and `.syx`
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

Connect MIDI → choose **Preset** or **System** scope → pick a group in the sidebar → edit parameters. Use the **preset bar** to load/save slots (0 = live step, 1–275 user, 276–300 favorites). Open **Library** for backups and file import/export.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run generate` | Regenerate parameter tables from [docs/VoiceLive-Touch-Sysex-Manual.md](docs/VoiceLive-Touch-Sysex-Manual.md) |
| `npm run extract-manual` | Re-extract [docs/VoiceLive-2-Manual-v1-5.md](docs/VoiceLive-2-Manual-v1-5.md) from the VoiceLive 2 PDF (requires `.venv-pdf`) |
| `npm run dev` | Electron dev with HMR |
| `npm run build` | Production build |
| `npm run dist` | macOS `.dmg` / `.zip` |

## Project layout

```
packages/core/       SysEx, MidiParameterService, generated parameter registry
packages/ui/         ParameterControl, ParameterPanel
apps/desktop/        Electron shell (EditorShell)
scripts/             generate-parameters.mjs
docs/                SysEx, user, VoiceSupport reference manuals (MD)
examples/            Reference Axoloti / Max editors
```

## Documentation

- [VoiceLive-Touch-Sysex-Manual.md](docs/VoiceLive-Touch-Sysex-Manual.md) — protocol and parameter IDs
- [VoiceLive-Touch-User-Manual.md](docs/VoiceLive-Touch-User-Manual.md) — device UI context (German source PDF)
- [VoiceSupport-Reference-Manual.md](docs/VoiceSupport-Reference-Manual.md) — local library / backup UX (VoiceSupport-inspired)
- [VoiceLive-2-Manual-v1-5.md](docs/VoiceLive-2-Manual-v1-5.md) — VoiceLive 2 user manual (v1.5 PDF extract; MIDI CC labels, harmony UI)

## MIDI troubleshooting

- **No outputs** — check USB and Audio MIDI Setup
- **Send works, no readback** — confirm MIDI **input** port; try Refresh group
- **Wrong values** — verify SysEx ID matches device (`Utility SysEx_ID`, system param 858)
- Enable **Debug hex** to compare with [examples/](examples/)

## Presets and library

- **Load from device** — requests preset header + data (`0x45` → `0x20` + `0x21`), updates all preset parameters in the editor.
- **Save to device** — sends header + data; **load first** so unsent slots are not zeroed.
- **Library** — backup workspace to `~/Library/Application Support/voice-live-touch-editor/preset-library/backups/`, export/import JSON or SysEx.

Enum labels (Key, Scale, styles) are defined in `packages/core/src/parameter-enums.json` and the [MIDI enum appendix](docs/VoiceLive-Touch-User-Manual.md#midi-enum-appendix-editor).

## License

SysEx documentation © TC-Helicon. Application code: use and modify for personal/editor tooling.
