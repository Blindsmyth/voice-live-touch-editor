# TC-Helicon VoiceLive Touch — User Manual

| | |
|---|---|
| **Version** | 1.0 (German) |
| **Source PDF** | [VoiceLive-Touch-User-Manual.pdf](./VoiceLive-Touch-User-Manual.pdf) |
| **Original** | TC-Helicon / manualslib.de transcription |
| **Language** | German (body); this MD adds English navigation for the editor project |

> **Editor note:** Use this document for **UI grouping** (Harmony, Loops, Mix, MIDI setup). SysEx IDs and ranges are in [VoiceLive-Touch-Sysex-Manual.md](./VoiceLive-Touch-Sysex-Manual.md).

---

## Table of contents

1. [Before you begin](#before-you-begin)
2. [Safety and mounting](#safety-and-mounting)
3. [Connections](#connections)
4. [Front panel overview](#front-panel-overview)
5. [Basic operation](#basic-operation)
6. [Presets and favorites](#presets-and-favorites)
7. [Harmony and HardTune](#harmony-and-hardtune)
8. [Loops](#loops)
9. [Effect parameters](#effect-parameters)
10. [Guitar functions](#guitar-functions)
11. [Setup menu](#setup-menu)
12. [MIDI setup menu](#midi-setup-menu) — see also SysEx `Utility SysEx_ID`
13. [Advanced looping](#advanced-looping)
14. [USB and digital audio](#usb-and-digital-audio)
15. [MIDI implementation](#midi-implementation)
16. [Factory preset list](#factory-preset-list)
17. [FAQ / troubleshooting](#faq--troubleshooting)
18. [Specifications](#specifications)

---

## Before you begin

- Download the latest manual and register the product via [TC-Helicon Support](https://www.tc-helicon.com/support).
- Install [VoiceSupport](https://www.tc-helicon.com/voicesupport) for firmware updates and preset management (drag-and-drop presets, favorites 276–300 in VoiceSupport). See also [VoiceSupport-Reference-Manual.md](./VoiceSupport-Reference-Manual.md) for how this editor’s **Library** tab maps to VoiceSupport workflows.

---

## Safety and mounting

- Mic stand mount: max stand diameter **16.5 mm**; mount/unmount without cables attached.
- Cable routing through horizontal slot; use included cable clip.

---

## Connections

| # | Connector | Purpose |
|---|-----------|---------|
| 1 | MIC IN (XLR) | Low-Z mic input |
| 2 | XLR OUT | Mono output when configured |
| 3 | GRND | Ground lift |
| 4 | TRS OUT | Main outputs (mono/dual mono/stereo in setup) |
| 5 | GUITAR IN / THRU | High-Z guitar; THRU to pedal chain or amp |
| 6 | AUX IN | External mix (no FX) |
| 7 | MIDI IN | External harmony key / preset control |
| 8 | Power | Always on when powered |
| 9 | USB | Firmware + MIDI (no bus power) |
| 10 | FOOTSWITCH | TC Switch 3 (TRS) |
| 11 | Headphone + level | 3.5 mm |
| 12 | Input level | Green = signal; avoid CLIP |

---

## Front panel overview

| Control | Function |
|---------|----------|
| **Effect blocks** | Tap = bypass block; hold = edit block (Delay tap tempo) |
| **Harmony voicing keys** | Enable harmony voices; hold active voice to edit |
| **LEDs** | Input, Clip, MIDI activity, tempo blink |
| **MIX** | Tap = mix menu; hold = **Setup menu** |
| **Display** | Favorite bank/number or preset number; shows param names when editing |
| **Loop** | Red = record; green = play; hold red = clear loop |
| **Arrow keys** | Next/prev preset in Home; navigate edit menus |
| **Slider** | Wipe = fast scroll; drag = fine adjust; double-tap = Home |
| **Favorites** | Tap load; hold save; hold slider + tap favorite = bank A–E |
| **Talk** | Tap = bypass FX (except Tone); hold = guitar tuner |

**Effect blocks on device** (maps to editor **Block_*** SysEx params): Harmony, Double, uMod, Delay, Reverb, FX/Transducer, Choir, Correct, Tone, Guitar FX.

---

## Basic operation

- Double-tap slider to return to **HOME**.
- Slider shows preset names or parameter values when editing.

---

## Presets and favorites

- 200+ factory presets; 25 favorites in banks A–E (5 banks × 5 slots).
- Hold favorite to save current preset+edits.
- Blinking favorite LED = unsaved changes.

---

## Harmony and HardTune

- Control via guitar, MIDI, or AUX pitch source.
- Or set key/scale manually without instrument.
- **Voicing fields** — per-voice harmony editing (maps to Harmony Int_* / Gender / Portamento SysEx params).

---

## Loops

- Simple loop record/overdub; edit menus for undo/double length.
- **Loops mode** and **Shots mode** for advanced looping.

---

## Effect parameters

- Hold effect block to enter edit mode; arrow keys + slider adjust values.
- Parameters shown on display correspond to SysEx preset package (see SysEx manual).

---

## Guitar functions

- Guitar input gain, THRU routing, guitar-specific reverb/micromod params (system + preset tables).

---

## Setup menu

- Open via **hold MIX**.
- Phantom power, mono/stereo, MIDI channel, input gain modes, etc.
- Maps largely to **system** SysEx parameters (`Utility_*`, `Block_*`).

---

## MIDI setup menu

- Advanced MIDI: SysEx ID, control assignments, harmony control source.
- **SysEx ID** must match the desktop editor setting (default 0). See [SysEx manual — Utility SysEx_ID](./VoiceLive-Touch-Sysex-Manual.md) (ID 858).

---

## Advanced looping

- Loops mode: extended loop UI and controls.
- Shots mode: one-shot loop segments.

---

## USB and digital audio

- USB for VoiceSupport and MIDI; audio sample rate settings when using USB audio.

---

## MIDI implementation

- MIDI IN for preset change and harmony key.
- Controller 44 for loop functions (see manual p.42).
- Full SysEx protocol: [VoiceLive-Touch-Sysex-Manual.md](./VoiceLive-Touch-Sysex-Manual.md).

### MIDI enum appendix (editor)

Discrete parameters use labels from the VoiceLive Touch Complete Manual (ENG) MIDI table and [VoiceLive-2-Manual-v1-5.md](./VoiceLive-2-Manual-v1-5.md) (MIDI implementation, pp. 98–100). Maintained in `packages/core/src/parameter-enums.json`.

| SysEx ID | Name | Values |
|----------|------|--------|
| 107 | Harmony Key | 0=C, 1=C#, 2=D, 3=Eb, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=Bb, 11=B |
| 108 | Harmony Scale | 0=Maj1, 1=Maj2, 2=Maj3, 3=Min1, 4=Min2, 5=Min3, 6=Custom |
| 963 | Correct Key_Storage | Same as Harmony Key |

Other small-range **Style** parameters use numeric labels unless added to `parameter-enums.json`.

---

## Factory preset list

- See PDF pages 43+ for numbered factory preset names and categories.

---

## FAQ / troubleshooting

- Ground hum → GRND lift.
- Clipping → reduce input level.
- MIDI not working → check channel, USB driver, SysEx ID.

---

## Specifications

- See PDF page 60 for power, I/O levels, and physical specs.

---

## Mapping to editor UI groups

| Device concept | Editor sidebar group |
|----------------|---------------------|
| Harmony / voicing | Harmony |
| Doubling | Doubling |
| MIX menu levels | Mixer |
| uMod / MicroMod | MicroMod |
| Delay block | Delay |
| Reverb block | Reverb |
| Transducer / FX block | Transducer |
| HardTune / Correct | Pitch |
| Ducking | Ducking |
| EQ (harmony path) | EQ |
| Gate | Gate |
| Setup / Blocks / Utility | Setup |
| Everything else | Other |
