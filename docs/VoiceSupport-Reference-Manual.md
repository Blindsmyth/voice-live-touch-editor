# TC-Helicon VoiceSupport — Reference Manual (Editor Project)

| | |
|---|---|
| **Sources** | VoiceSupport 1.2 User Guide; VoiceSupport 2 Reference Manual |
| **Purpose** | Local preset-library UX for [Voice Live Touch Editor](../README.md) (no online/cloud stack) |

> **Device scope:** VoiceLive Touch **v1** — user presets **1–275**, favorites **276–300** (banks A–E × 5). SysEx protocol: [VoiceLive-Touch-Sysex-Manual.md](./VoiceLive-Touch-Sysex-Manual.md).

---

## Table of contents

1. [Overview](#overview)
2. [Working Data (workspace)](#working-data-workspace)
3. [Archives and backups](#archives-and-backups)
4. [Export and import](#export-and-import)
5. [VoiceLive Touch favorites](#voicelive-touch-favorites)
6. [Editor mapping](#editor-mapping)
7. [Out of scope](#out-of-scope)

---

## Overview

VoiceSupport connects a TC-Helicon USB product to a computer for:

- Preset download/upload (Working Data mirror of the device)
- Timestamped **Archives** (backups)
- **Export** / **Import** of preset and setup data as MIDI SysEx (`.syx`)
- Firmware updates and online preset packs (not replicated in this editor)

VoiceSupport 2 adds automatic archive migration when firmware adds parameters; this editor targets parameter set version **0.26** only.

---

## Working Data (workspace)

After **sync** (download from device), presets appear in **Working Data** with icons for factory vs user, modified state, etc.

**Editor equivalent:** in-memory **Workspace** — each loaded preset is a `PresetSnapshot` (slot, 15-char name, 226 parameter values). Edits in the parameter pages update live values; **Save to device** writes the snapshot via SysEx `0x20` / `0x21`.

---

## Archives and backups

| VoiceSupport action | Description |
|---------------------|-------------|
| **Backup User** | All user presets in workspace → new archive |
| **Backup Selected** | Selected presets only |
| **Backup All** | Everything visible in workspace |

Archives are named by **date/time**; can be renamed. Stored locally under the application data folder.

**Editor equivalent:** `backups/YYYY-MM-DD_HH-mm-ss/` containing `.vltpreset.json` files (and optional metadata).

---

## Export and import

| Field | Options |
|-------|---------|
| **Export Data** | Selected presets, All presets, Setup data |
| **Export Source** | Working Data or an Archive |
| **File Handling** | Single `.syx` or one file per preset |
| **Import Destination** | Working Data or Archive |
| **Import** | Browse `.syx`; optional starting preset slot |

**Editor equivalent:**

- **Export** `.vltpreset.json` (canonical) or raw **`.syx`** (concatenated `F0…F7` messages)
- **Import** either format into workspace, then **Send to device**

---

## VoiceLive Touch favorites

From VoiceSupport 1.2 §6.6:

| Bank | Preset slots |
|------|----------------|
| A | 276–280 |
| B | 281–285 |
| C | 286–290 |
| D | 291–295 |
| E | 296–300 |

Hold a favorite on the hardware to store the current preset+edits. The editor preset picker labels these banks.

---

## Editor mapping

| VoiceSupport | Voice Live Touch Editor |
|--------------|-------------------------|
| Working Data | Workspace list |
| Archive | `userData/backups/<timestamp>/` |
| Backup workspace | Save all workspace JSON to new backup folder |
| Export SysEx | Export `.syx` / `.vltpreset.json` |
| Import SysEx | Import into workspace |
| Rename preset | Preset name field + Save to device |
| Sync from device | Load preset / Sync slots (staggered `0x45`) |

---

## Out of scope

- Firmware update UI
- TC-Helicon online library / account / VoiceCouncil feeds
- VoiceSupport 2 cross-device offline device list
- VoiceLive Touch **2** (different product)
