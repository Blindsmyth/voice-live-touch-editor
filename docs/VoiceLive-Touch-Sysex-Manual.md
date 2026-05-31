# TC-Helicon VoiceLive Touch MIDI SysEx Manual

| | |
|---|---|
| **Version** | 1.2.00 |
| **Last modified** | June 29, 2012 |
| **Source** | [VoiceLive Touch Sysex Manual.pdf](./VoiceLive%20Touch%20Sysex%20Manual.pdf) |

This document is a Markdown transcription of the official PDF for easier reading and for use when building editors. Hex values use the `0x` prefix as in the original manual.

---

## Hexadecimal notation

Many values are in hexadecimal. Hex numbers are prefixed with `0x`.

---

## SysEx template

Every SysEx message follows this structure:

| Bytes | Description |
|-------|-------------|
| `0xF0` | MIDI System Exclusive start |
| `0x00` | TC-Helicon manufacturer ID (3 bytes) |
| `0x01` | … |
| `0x38` | … |
| *Sysex ID* | User parameter from MIDI setup menu (`Utility SysEx_ID`, ID 858, range 0–127) |
| `0x5B` | Model ID (VoiceLive Touch) |
| *Message ID* | Message identifier (see below) |
| *Data* | Variable payload |
| `0xF7` | SysEx end |

**Full message layout:**

```
F0 00 01 38 <sysexId> 5B <messageId> <data...> F7
```

---

## Data packing

MIDI SysEx data bytes must be 7-bit (MSB = 0). **14-bit** and **28-bit** signed integers are split into 7-bit segments.

### 14-bit packing

For value `val`:

1. If `val < 0`, use `temp = 16384 + val`
2. Otherwise `temp = val`
3. `msb = floor(temp / 128)`
4. `lsb = temp - (msb * 128)`

Transmit as two bytes: `msb`, `lsb`.

### 28-bit packing (2’s complement signed)

For value `val`:

1. If `val < 0`, use `temp = 16384 * 16384 + val` (i.e. `2^28 + val`)
2. Otherwise `temp = val`
3. Split into four 7-bit bytes (MSB first in wire order for the manual’s VBA):

   - `msb3 = floor(temp / 2097152)`
   - `msb2 = floor(temp / 16384)`
   - `msb = floor(temp / 128)` (after subtracting higher parts in full algorithm)
   - `lsb` = remainder

The manual’s VBA returns bytes in order: **msb3, msb2, msb, lsb**.

### Negative values (common editor shortcut)

Used in the project’s Axoloti reference editor for live parameter writes when `val < 0`:

| Byte | Value |
|------|--------|
| msb3 | 31 |
| msb2 | 127 |
| msb | 127 |
| lsb | `128 + val` |

### Reference: VBA from manual

```vb
Function create_14_compliment(ByVal val As Long) As String
  Dim temp As Long
  temp = val
  If val < 0 Then temp = 16384 + val
  msb = Int(temp / 128)
  lsb = temp - (msb * 128)
  ' returns msb & " " & lsb
End Function

Function create_28_compliment(ByVal val As Long) As String
  Dim temp As Long
  temp = val
  If val < 0 Then temp = 16384 * 16384 + val
  msb = Int(temp / 128)
  msb2 = Int(temp / 16384)
  msb3 = Int(temp / 2097152)
  lsb = temp - ((msb * 128) + (msb2 * 16384) + (msb3 * 2097152))
  ' returns msb3 & " " & msb2 & " " & msb & " " & lsb
End Function
```

---

## Preset numbers and names

- Preset numbers use **14-bit** packing.
- Preset numbering **starts at 1**.
- Requesting a non-existent user preset returns an “empty preset” notification.
- Preset names: up to **15 ASCII** characters, NULL-terminated if shorter.

---

## Checksums

Checksums are **1 byte**: the 7 least significant bits of the sum of all bytes marked `(cs)` in the message.

**Example:** bytes `1…126` sum to `8001`; `8001 mod 128 = 65` → checksum byte `65`.

---

## Message reference

### Request messages

| Message | ID | Data |
|---------|-----|------|
| Request Preset | `0x45` | 2 bytes: preset number (14-bit packed). Response: Preset Header + Preset Data. Preset `0` = current edited step only. |
| Request Preset Header | `0x46` | 2 bytes: preset number (14-bit packed). Response: Preset Header only. |
| Request Parameter | `0x47` | 2 bytes: SysEx parameter ID (14-bit packed). Response: Parameter Data (`0x22`). |
| Request Setup | `0x15` | 1 byte (ignored). Response: Setup Data stream. |

### Data messages

| Message | ID | Data layout |
|---------|-----|-------------|
| Preset Header | `0x20` | 2 preset #, 2 version, 15 name (ASCII), 4 tags (28-bit), 1 step count. Always followed by Preset Data messages. |
| Preset Data | `0x21` | 1 index (0-based), 100 bytes (25 × 28-bit params), 1 checksum over `(cs)` bytes. |
| Parameter Data | `0x22` | 6 bytes: 2 = parameter ID (14-bit packed), 4 = value (28-bit signed). Send to **set**; receive after `0x47` **get**. Out-of-range values are clamped. |
| Setup Data | `0x13` | 2 setup version, 1 message number, 100 bytes (25 × 28-bit), 1 checksum. All setup messages must be received in order to overwrite setup. |

### Misc messages

| Message | ID | Data |
|---------|-----|------|
| Notification | `0x34` | 1 byte status (see table below) |
| Presets Delete | `0x50` | 2 bytes: preset number (14-bit packed) |
| Editor Mode | `0x53` | 1 byte (see table below) |
| Activated Preset Info | `0x23` | 2 active preset #, 1 active step (read-only; from Editor Mode cmd 3) |

#### Notification (`0x34`) codes

| Data | Meaning |
|------|---------|
| 1 | Preset data received (wait before sending next preset dump) |
| 2 | Last requested preset does not exist / out of range |
| 3 | Memory full |
| 4 | Incompatible preset version |
| 6 | Checksum failed |
| 7 | Too many steps |
| 8 | Preset packages out of sync (slow down host) |

#### Editor Mode (`0x53`) codes

| Data | Meaning |
|------|---------|
| 0 | Editor mode off |
| 1 | Editor mode on (parameter edits echoed via SysEx) |
| 2 | Restore factory presets (**deletes all user presets**) |
| 3 | Request activated preset info (`0x23`) |

---

## Quick reference: single-parameter edit (POC)

**Harm Volume** in the reference Max/Axoloti editor maps to:

| Field | Value |
|-------|--------|
| Name | `Mixer_L Level Harmony` |
| SysEx parameter ID | **193** (`0xC1`) |
| Min / Max / Centre | **-61** / **0** / **-60** (dB-style levels) |
| Preset table offset | 77 |

### Set parameter (host → device)

Message ID **`0x22`** (Parameter Data). **14 bytes** total:

```
F0 00 01 38 <sysexId> 5B 22 <paramMSB> <paramLSB> <v3> <v2> <v1> <v0> F7
```

Example with `sysexId = 0`, parameter ID `193`:

- `paramMSB = 1`, `paramLSB = 65` (because `193 = 1×128 + 65`)

### Request parameter (host → device)

Message ID **`0x47`**. Payload: 14-bit packed parameter ID (2 bytes after header).

### Response (device → host)

Message ID **`0x22`**, 6 data bytes: param ID + 28-bit value.

---

## Preset package parameter table

**Parameter set version:** `0.26`

| Offset | ID | Parameter Name | Min | Max | Centre |
|--------|-----|----------------|-----|-----|--------|
| 0 | 41 | ParEq Low_Gain Harm | -12 | 12 | 0 |
| 1 | 44 | ParEq Low_Freq Harm | 0 | 240 | 140 |
| 2 | 47 | ParEq Par1_Gain Harm | -12 | 12 | 0 |
| 3 | 50 | ParEq Par1_Freq Harm | 0 | 240 | 140 |
| 4 | 53 | ParEq Par1_BW Harm | 0 | 16 | 8 |
| 5 | 56 | ParEq Hi_Gain Harm | -12 | 12 | 0 |
| 6 | 59 | ParEq Hi_Freq Harm | 0 | 240 | 140 |
| 7 | 64 | AutoGateT ManualThreshold | -61 | 0 | -60 |
| 8 | 65 | AutoGateGain GroupStyle | 0 | 1 | 0 |
| 9 | 78 | Harmony GroupStyle_NP | 0 | 14 | 0 |
| 10 | 79 | Harmony GroupStyle_NOTES | 0 | 3 | 0 |
| 11 | 80 | Harmony GroupStyle_NOTES4CH | 0 | 3 | 0 |
| 12 | 81 | Harmony GroupStyle_SHIFT | 0 | 3 | 0 |
| 13 | 82 | Harmony HumanStyle | 0 | 6 | 0 |
| 14 | 83 | Harmony VibratoStyle | 0 | 7 | 0 |
| 15 | 84 | Harmony HumanAmount | 0 | 100 | 50 |
| 16 | 85 | Harmony VibratoAmount | 0 | 100 | 50 |
| 17 | 88 | Choir Style | 0 | 14 | 0 |
| 18 | 89 | Choir Mix | 0 | 100 | 50 |
| 19 | 106 | Harmony NaturalPlay | 0 | 7 | 3 |
| 20 | 107 | Harmony Key | 0 | 11 | 6 |
| 21 | 108 | Harmony Scale | 0 | 6 | 3 |
| 22 | 111 | Harmony Tuning | 0 | 2 | 0 |
| 23 | 112 | Harmony Int_NP V1 | 0 | 6 | 2 |
| 24 | 113 | Harmony Int_NP V2 | 0 | 6 | 2 |
| 25 | 114 | Harmony Int_NP V3 | 0 | 6 | 2 |
| 26 | 115 | Harmony Int_NP V4 | 0 | 6 | 2 |
| 27 | 116 | Harmony Int_scale V1 | 0 | 28 | 14 |
| 28 | 117 | Harmony Int_scale V2 | 0 | 28 | 14 |
| 29 | 118 | Harmony Int_scale V3 | 0 | 28 | 14 |
| 30 | 119 | Harmony Int_scale V4 | 0 | 28 | 14 |
| 31 | 120 | Harmony Int_shift V1 | -24 | 24 | 0 |
| 32 | 121 | Harmony Int_shift V2 | -24 | 24 | 0 |
| 33 | 122 | Harmony Int_shift V3 | -24 | 24 | 0 |
| 34 | 123 | Harmony Int_shift V4 | -24 | 24 | 0 |
| 35 | 128 | Harmony Smoothing V1 | 0 | 100 | 50 |
| 36 | 129 | Harmony Smoothing V2 | 0 | 100 | 50 |
| 37 | 130 | Harmony Smoothing V3 | 0 | 100 | 50 |
| 38 | 131 | Harmony Smoothing V4 | 0 | 100 | 50 |
| 39 | 132 | Harmony Latch | 0 | 1 | 0 |
| 40 | 133 | Harmony ChordStyle | 0 | 1 | 0 |
| 41 | 134 | Harmony Attack | 0 | 1000 | 500 |
| 42 | 136 | Harmony Release | 0 | 2000 | 1000 |
| 43 | 139 | Harmony Hold_Release | 0 | 100 | 0 |
| 44 | 142 | Harmony NotesExtSwitch | 0 | 1 | 0 |
| 45 | 143 | Harmony Gender V1 | -50 | 50 | 0 |
| 46 | 144 | Harmony Gender V2 | -50 | 50 | 0 |
| 47 | 145 | Harmony Gender V3 | -50 | 50 | 0 |
| 48 | 146 | Harmony Gender V4 | -50 | 50 | 0 |
| 49 | 147 | Harmony Portamento V1 | 0 | 200 | 25 |
| 50 | 148 | Harmony Portamento V2 | 0 | 200 | 25 |
| 51 | 149 | Harmony Portamento V3 | 0 | 200 | 25 |
| 52 | 150 | Harmony Portamento V4 | 0 | 200 | 25 |
| 53 | 157 | Harmony Notes_Pan | 0 | 2 | 0 |
| 54 | 158 | Harmony Notes_Smoothing | 0 | 100 | 50 |
| 55 | 159 | Harmony Notes_Gender | -50 | 50 | 0 |
| 56 | 160 | Harmony Notes_Portamento | 0 | 200 | 25 |
| 57 | 161 | Doubling GroupStyle | 0 | 5 | 0 |
| 58 | 162 | Doubling HumanStyle | 0 | 6 | 0 |
| 59 | 163 | Doubling HumanAmount | 0 | 100 | 50 |
| 60 | 164 | Doubling Smoothing V1 | 0 | 100 | 50 |
| 61 | 165 | Doubling Smoothing V2 | 0 | 100 | 50 |
| 62 | 166 | Doubling Smoothing V3 | 0 | 100 | 50 |
| 63 | 167 | Doubling Smoothing V4 | 0 | 100 | 50 |
| 64 | 168 | Doubling Portamento V1 | 0 | 200 | 25 |
| 65 | 169 | Doubling Portamento V2 | 0 | 200 | 25 |
| 66 | 170 | Doubling Portamento V3 | 0 | 200 | 25 |
| 67 | 171 | Doubling Portamento V4 | 0 | 200 | 25 |
| 68 | 172 | Harmony Doubling | 0 | 1 | 0 |
| 69 | 177 | Mixer_L Level Dry2uMod | -61 | 0 | -60 |
| 70 | 178 | Mixer_L Level Harm2uMod | -61 | 0 | -60 |
| 71 | 179 | Mixer_L Level Dry2Delay | -61 | 0 | -60 |
| 72 | 180 | Mixer_L Level Harm2Delay | -61 | 0 | -60 |
| 73 | 181 | Mixer_L Level uMod2Delay | -61 | 0 | -60 |
| 74 | 183 | Mixer_L Level Dry2Reverb | -61 | 0 | -60 |
| 75 | 184 | Mixer_L Level Harm2Reverb | -61 | 0 | -60 |
| 76 | 185 | Mixer_L Level Delay2Reverb | -61 | 0 | -60 |
| **77** | **193** | **Mixer_L Level Harmony** | **-61** | **0** | **-60** |
| 78 | 194 | Mixer_L Level HarmonyDoubling | -61 | 0 | -60 |
| 79 | 195 | Mixer_L Level Doubling | -61 | 0 | -60 |
| 80 | 201 | Mixer_LP Level Lead | -61 | 0 | -60 |
| 81 | 202 | Mixer_LP Level H1 | -61 | 0 | -60 |
| 82 | 203 | Mixer_LP Level H2 | -61 | 0 | -60 |
| 83 | 204 | Mixer_LP Level H3 | -61 | 0 | -60 |
| 84 | 205 | Mixer_LP Level H4 | -61 | 0 | -60 |
| 85 | 210 | Mixer_LP Level D1 | -61 | 0 | -60 |
| 86 | 211 | Mixer_LP Level D2 | -61 | 0 | -60 |
| 87 | 212 | Mixer_LP Level D3 | -61 | 0 | -60 |
| 88 | 213 | Mixer_LP Level D4 | -61 | 0 | -60 |
| 89 | 215 | Mixer_LP Pan Lead | -100 | 100 | 0 |
| 90 | 216 | Mixer_LP Pan H1 | -100 | 100 | 0 |
| 91 | 217 | Mixer_LP Pan H2 | -100 | 100 | 0 |
| 92 | 218 | Mixer_LP Pan H3 | -100 | 100 | 0 |
| 93 | 219 | Mixer_LP Pan H4 | -100 | 100 | 0 |
| 94 | 224 | Mixer_LP Pan D1 | -100 | 100 | 0 |
| 95 | 225 | Mixer_LP Pan D2 | -100 | 100 | 0 |
| 96 | 226 | Mixer_LP Pan D3 | -100 | 100 | 0 |
| 97 | 227 | Mixer_LP Pan D4 | -100 | 100 | 0 |
| 98 | 229 | Mixer_LW Level Voc_uMod | -61 | 0 | -60 |
| 99 | 230 | Mixer_LW Level Voc_Delay | -61 | 0 | -60 |
| 100 | 231 | Mixer_LW Level Voc_Reverb | -61 | 0 | -60 |
| 101 | 234 | Mixer_LW Width Voc_uMod | 0 | 100 | 0 |
| 102 | 235 | Mixer_LW Width Voc_Delay | 0 | 100 | 0 |
| 103 | 236 | Mixer_LW Width Voc_Reverb | 0 | 100 | 0 |
| 104 | 239 | MicroMod Style Voice | 0 | 23 | 0 |
| 105 | 241 | MicroMod Detune_L Voice | -25 | 25 | 0 |
| 106 | 243 | MicroMod Detune_R Voice | -25 | 25 | 0 |
| 107 | 245 | MicroMod Mod_Depth_L Voice | 0 | 100 | 0 |
| 108 | 247 | MicroMod Mod_Depth_R Voice | 0 | 100 | 0 |
| 109 | 249 | MicroMod Mod_Speed Voice | 5 | 1000 | 0 |
| 110 | 251 | MicroMod Mod_LR_Phase Voice | 0 | 180 | 0 |
| 111 | 253 | MicroMod Mod_Wave Voice | 0 | 2 | 0 |
| 112 | 255 | MicroMod Delay_L Voice | 0 | 230 | 200 |
| 113 | 257 | MicroMod Delay_R Voice | 0 | 230 | 200 |
| 114 | 259 | MicroMod FB_L Voice | -100 | 100 | 0 |
| 115 | 261 | MicroMod FB_R Voice | -100 | 100 | 0 |
| 116 | 263 | MicroMod XFB_L Voice | -100 | 100 | 0 |
| 117 | 265 | MicroMod XFB_R Voice | -100 | 100 | 0 |
| 118 | 267 | MicroMod LoCut_L Voice | 0 | 240 | 0 |
| 119 | 269 | MicroMod LoCut_R Voice | 0 | 240 | 0 |
| 120 | 271 | MicroMod HiCut_L Voice | 0 | 240 | 0 |
| 121 | 273 | MicroMod HiCut_R Voice | 0 | 240 | 0 |
| 122 | 275 | MicroMod OutPhase Voice | 0 | 3 | 1 |
| 123 | 277 | Delay Style | 0 | 17 | 0 |
| 124 | 278 | Delay Source | 0 | 2 | 0 |
| 125 | 279 | Delay Tempo | 25 | 300 | 0 |
| 126 | 280 | Delay DelayTime_L | 0 | 2500 | 0 |
| 127 | 281 | Delay DelayTime_R | 0 | 2500 | 0 |
| 128 | 282 | Delay Division_L | 0 | 19 | 9 |
| 129 | 283 | Delay Division_R | 0 | 19 | 9 |
| 130 | 284 | Delay FB_L | 0 | 100 | 50 |
| 131 | 285 | Delay FB_R | 0 | 100 | 50 |
| 132 | 286 | Delay XFB_L_R | 0 | 100 | 50 |
| 133 | 287 | Delay XFB_R_L | 0 | 100 | 50 |
| 134 | 288 | Delay LoCut_L | 0 | 240 | 0 |
| 135 | 289 | Delay LoCut_R | 0 | 240 | 0 |
| 136 | 290 | Delay HiCut_L | 0 | 240 | 0 |
| 137 | 291 | Delay HiCut_R | 0 | 240 | 0 |
| 138 | 292 | Reverb StyleVoice | 0 | 29 | 0 |
| 139 | 297 | Reverb Decay Voice | 1 | 290 | 1 |
| 140 | 299 | Reverb PreDelay Voice | 0 | 100 | 0 |
| 141 | 301 | Reverb Diffuse Voice | -50 | 50 | 0 |
| 142 | 303 | Reverb LoColor Voice | -50 | 50 | 0 |
| 143 | 305 | Reverb HiColor Voice | -50 | 50 | 0 |
| 144 | 307 | Reverb HiFactor Voice | -25 | 25 | 0 |
| 145 | 309 | Reverb ModSpeed Voice | -25 | 25 | 0 |
| 146 | 311 | Reverb ModDepth Voice | -25 | 25 | 0 |
| 147 | 313 | Reverb EarlyLevel Voice | -25 | 0 | 0 |
| 148 | 315 | Reverb ReverbLevel Voice | -25 | 0 | 0 |
| 149 | 317 | Reverb DryLevel Voice | -25 | 0 | 0 |
| 150 | 803 | Transducer Style | 0 | 16 | 0 |
| 151 | 804 | Transducer Routing | 0 | 5 | 1 |
| 152 | 805 | Transducer DistortionAmount | 0 | 100 | 50 |
| 153 | 806 | Transducer BandLimitHP | 50 | 240 | 120 |
| 154 | 807 | Transducer BandLimitLP | 75 | 238 | 120 |
| 155 | 808 | Transducer PreGain | -20 | 20 | 0 |
| 156 | 809 | Transducer PostGain | -20 | 20 | 0 |
| 157 | 810 | Transducer DistortionType | 0 | 14 | 0 |
| 158 | 825 | Transducer PresenceGain | -20 | 20 | 0 |
| 159 | 826 | Transducer PresenceFC | 100 | 195 | 140 |
| 160 | 827 | Transducer PresenceBW | 0 | 16 | 8 |
| 161 | 828 | Hardtune Style | 0 | 12 | 0 |
| 162 | 829 | Correct KeySource | 0 | 1 | 0 |
| 163 | 830 | Correct Amount | 0 | 100 | 50 |
| 164 | 831 | Correct Window | 0 | 60 | 30 |
| 165 | 832 | Correct Rate | 0 | 100 | 50 |
| 166 | 833 | Correct Shift | -12 | 12 | 0 |
| 167 | 837 | Correct Scale | 0 | 5 | 0 |
| 168 | 839 | Correct Lead_Gender | -50 | 50 | 0 |
| 169 | 840 | Ducking Enable Delay | 0 | 1 | 0 |
| 170 | 841 | Ducking Enable Reverb | 0 | 1 | 0 |
| 171 | 842 | Ducking Level Delay | -61 | 0 | -60 |
| 172 | 843 | Ducking Level Reverb | -61 | 0 | -60 |
| 173 | 844 | Ducking Attack Delay | 0 | 45 | 0 |
| 174 | 845 | Ducking Attack Reverb | 0 | 45 | 0 |
| 175 | 846 | Ducking Release Delay | 0 | 45 | 0 |
| 176 | 847 | Ducking Release Reverb | 0 | 45 | 0 |
| 177 | 876 | Utility Dry_Level uMod | -61 | 0 | -60 |
| 178 | 877 | Utility Dry_Level Delay | -61 | 0 | -60 |
| 179 | 878 | Utility Dry_Level Reverb | -61 | 0 | -60 |
| 180 | 879 | Utility Dry_Level Harmony | -61 | 0 | -60 |
| 181 | 880 | Utility Dry_Level Double | -61 | 0 | -60 |
| 182 | 881 | Utility Dry_Level Preset | -61 | 0 | -60 |
| 183 | 897 | Preset PrePost | 0 | 1 | 0 |
| 184 | 898 | Preset Shortcut | 1 | 20 | 0 |
| 185 | 902 | Block MicroMod | 0 | 1 | 0 |
| 186 | 903 | Block Delay | 0 | 1 | 0 |
| 187 | 904 | Block Reverb | 0 | 1 | 0 |
| 188 | 905 | Block Harmony | 0 | 1 | 0 |
| 189 | 906 | Block Double | 0 | 1 | 0 |
| 190 | 907 | Block FX | 0 | 1 | 0 |
| 191 | 908 | Block Transducer | 0 | 1 | 0 |
| 192 | 909 | Block Choir | 0 | 1 | 0 |
| 193 | 910 | Block Correct | 0 | 1 | 0 |
| 194 | 936 | HarmonyMapCus V12_Root | 0 | 4095 | 0 |
| 195 | 937 | HarmonyMapCus V12_Minor2 | 0 | 4095 | 0 |
| 196 | 938 | HarmonyMapCus V12_Major2 | 0 | 4095 | 0 |
| 197 | 939 | HarmonyMapCus V12_Minor3 | 0 | 4095 | 0 |
| 198 | 940 | HarmonyMapCus V12_Major3 | 0 | 4095 | 0 |
| 199 | 941 | HarmonyMapCus V12_Perfect4 | 0 | 4095 | 0 |
| 200 | 942 | HarmonyMapCus V12_Augmented4 | 0 | 4095 | 0 |
| 201 | 943 | HarmonyMapCus V12_Peftect5 | 0 | 4095 | 0 |
| 202 | 944 | HarmonyMapCus V12_Minor6 | 0 | 4095 | 0 |
| 203 | 945 | HarmonyMapCus V12_Major6 | 0 | 4095 | 0 |
| 204 | 946 | HarmonyMapCus V12_Minor7 | 0 | 4095 | 0 |
| 205 | 947 | HarmonyMapCus V12_Major7 | 0 | 4095 | 0 |
| 206 | 948 | HarmonyMapCus V34_Root | 0 | 4095 | 0 |
| 207 | 949 | HarmonyMapCus V34_Minor2 | 0 | 4095 | 0 |
| 208 | 950 | HarmonyMapCus V34_Major2 | 0 | 4095 | 0 |
| 209 | 951 | HarmonyMapCus V34_Minor3 | 0 | 4095 | 0 |
| 210 | 952 | HarmonyMapCus V34_Major3 | 0 | 4095 | 0 |
| 211 | 953 | HarmonyMapCus V34_Perfect4 | 0 | 4095 | 0 |
| 212 | 954 | HarmonyMapCus V34_Augmented4 | 0 | 4095 | 0 |
| 213 | 955 | HarmonyMapCus V34_Peftect5 | 0 | 4095 | 0 |
| 214 | 956 | HarmonyMapCus V34_Minor6 | 0 | 4095 | 0 |
| 215 | 957 | HarmonyMapCus V34_Major6 | 0 | 4095 | 0 |
| 216 | 958 | HarmonyMapCus V34_Minor7 | 0 | 4095 | 0 |
| 217 | 959 | HarmonyMapCus V34_Major7 | 0 | 4095 | 0 |
| 218 | 960 | CorrectionMapCus Bitfield | 0 | 4095 | 0 |
| 219 | 962 | Preset Exp_Func | 0 | 17 | 0 |
| 220 | 963 | Correct Key_Storage | 0 | 11 | 0 |
| 221 | 964 | Preset Source | 0 | 65535 | 0 |
| 222 | 979 | Doubling Gender V1 | -50 | 50 | 0 |
| 223 | 980 | Doubling Gender V2 | -50 | 50 | 0 |
| 224 | 981 | Doubling Gender V3 | -50 | 50 | 0 |
| 225 | 982 | Doubling Gender V4 | -50 | 50 | 0 |

Preset data messages carry **25 parameters per message** (100 packed bytes). Use offset to locate which `0x21` message index contains a given parameter.

---

## System package parameter table

**Parameter set version:** `0.26`

| Offset | ID | Parameter Name | Min | Max | Centre |
|--------|-----|----------------|-----|-----|--------|
| 0 | 0 | Utility Tone_Style | 0 | 8 | 0 |
| 1 | 3 | PreFX CompThresh | -60 | 0 | 0 |
| 2 | 4 | PreFX CompRatio | 0 | 14 | 0 |
| 3 | 40 | ParEq Low_Gain Voice | -12 | 12 | 0 |
| 4 | 42 | ParEq Low_Gain Guitar | -12 | 12 | 0 |
| 5 | 43 | ParEq Low_Freq Voice | 0 | 240 | 140 |
| 6 | 45 | ParEq Low_Freq Guitar | 0 | 240 | 140 |
| 7 | 46 | ParEq Par1_Gain Voice | -12 | 12 | 0 |
| 8 | 48 | ParEq Par1_Gain Guitar | -12 | 12 | 0 |
| 9 | 49 | ParEq Par1_Freq Voice | 0 | 240 | 140 |
| 10 | 51 | ParEq Par1_Freq Guitar | 0 | 240 | 140 |
| 11 | 52 | ParEq Par1_BW Voice | 0 | 16 | 8 |
| 12 | 54 | ParEq Par1_BW Guitar | 0 | 16 | 8 |
| 13 | 55 | ParEq Hi_Gain Voice | -12 | 12 | 0 |
| 14 | 57 | ParEq Hi_Gain Guitar | -12 | 12 | 0 |
| 15 | 58 | ParEq Hi_Freq Voice | 0 | 240 | 140 |
| 16 | 60 | ParEq Hi_Freq Guitar | 0 | 240 | 140 |
| 17 | 61 | AutoGate Mode | 0 | 2 | 0 |
| 18 | 62 | AutoGate ManualThreshold | -61 | 0 | -60 |
| 19 | 69 | AutoGateGain Level Lead | -61 | 0 | -60 |
| 20 | 70 | AutoGateGain Level Harm | -61 | 0 | -60 |
| 21 | 71 | AutoGateGain Attack Lead | 0 | 4 | 0 |
| 22 | 72 | AutoGateGain Attack Harm | 0 | 4 | 0 |
| 23 | 73 | AutoGateGain Release Lead | 0 | 4 | 0 |
| 24 | 74 | AutoGateGain Release Harm | 0 | 4 | 0 |
| 25 | 87 | Harmony VibratoControl | 0 | 1 | 0 |
| 26 | 190 | Mixer_L Level AuxLevel | -61 | 0 | -60 |
| 27 | 191 | Mixer_L Level GtrFxLevel | -61 | 0 | -60 |
| 28 | 192 | Mixer_L Level OverallOutput | -61 | 0 | -60 |
| 29 | 197 | Mixer_L Level UsbStereoOut | -61 | 0 | -60 |
| 30 | 199 | Mixer_L_6dB Level DlyRevLevel | -61 | 6 | -60 |
| 31 | 200 | Mixer_L_6dB Level VoicesLevel | -61 | 6 | -60 |
| 32 | 232 | Mixer_LW Level Gtr_uMod | -61 | 0 | -60 |
| 33 | 233 | Mixer_LW Level Gtr_Reverb | -61 | 0 | -60 |
| 34 | 237 | Mixer_LW Width Gtr_uMod | 0 | 100 | 0 |
| 35 | 238 | Mixer_LW Width Gtr_Reverb | 0 | 100 | 0 |
| 36 | 240 | MicroMod Style Guitar | 0 | 23 | 0 |
| 37 | 242 | MicroMod Detune_L Guitar | -25 | 25 | 0 |
| 38 | 244 | MicroMod Detune_R Guitar | -25 | 25 | 0 |
| 39 | 246 | MicroMod Mod_Depth_L Guitar | 0 | 100 | 0 |
| 40 | 248 | MicroMod Mod_Depth_R Guitar | 0 | 100 | 0 |
| 41 | 250 | MicroMod Mod_Speed Guitar | 5 | 1000 | 0 |
| 42 | 252 | MicroMod Mod_LR_Phase Guitar | 0 | 180 | 0 |
| 43 | 254 | MicroMod Mod_Wave Guitar | 0 | 2 | 0 |
| 44 | 256 | MicroMod Delay_L Guitar | 0 | 230 | 200 |
| 45 | 258 | MicroMod Delay_R Guitar | 0 | 230 | 200 |
| 46 | 260 | MicroMod FB_L Guitar | -100 | 100 | 0 |
| 47 | 262 | MicroMod FB_R Guitar | -100 | 100 | 0 |
| 48 | 264 | MicroMod XFB_L Guitar | -100 | 100 | 0 |
| 49 | 266 | MicroMod XFB_R Guitar | -100 | 100 | 0 |
| 50 | 268 | MicroMod LoCut_L Guitar | 0 | 240 | 0 |
| 51 | 270 | MicroMod LoCut_R Guitar | 0 | 240 | 0 |
| 52 | 272 | MicroMod HiCut_L Guitar | 0 | 240 | 0 |
| 53 | 274 | MicroMod HiCut_R Guitar | 0 | 240 | 0 |
| 54 | 276 | MicroMod OutPhase Guitar | 0 | 3 | 1 |
| 55 | 298 | Reverb Decay Guitar | 1 | 290 | 1 |
| 56 | 300 | Reverb PreDelay Guitar | 0 | 100 | 0 |
| 57 | 302 | Reverb Diffuse Guitar | -50 | 50 | 0 |
| 58 | 304 | Reverb LoColor Guitar | -50 | 50 | 0 |
| 59 | 306 | Reverb HiColor Guitar | -50 | 50 | 0 |
| 60 | 308 | Reverb HiFactor Guitar | -25 | 25 | 0 |
| 61 | 310 | Reverb ModSpeed Guitar | -25 | 25 | 0 |
| 62 | 312 | Reverb ModDepth Guitar | -25 | 25 | 0 |
| 63 | 314 | Reverb EarlyLevel Guitar | -25 | 0 | 0 |
| 64 | 316 | Reverb ReverbLevel Guitar | -25 | 0 | 0 |
| 65 | 318 | Reverb DryLevel Guitar | -25 | 0 | 0 |
| 66 | 838 | Correct Pitch_Amount | 0 | 100 | 50 |
| 67 | 848 | Utility Mic_GainSetMode | 0 | 1 | 0 |
| 68 | 849 | Utility Mic_Phantom | 0 | 2 | 0 |
| 69 | 851 | Utility Input_DynamicGain | 0 | 66 | 30 |
| 70 | 852 | Utility Input_CondenserGain | 0 | 66 | 30 |
| 71 | 853 | Utility AutoTargetGain | -20 | 0 | -6 |
| 72 | 854 | Utility MonoStereo | 0 | 2 | 0 |
| 73 | 855 | Utility MIDI_Channel | 0 | 16 | 0 |
| 74 | 856 | Utility CCChan | 0 | 16 | 0 |
| 75 | 857 | Utility Filter | 0 | 3 | 0 |
| 76 | 858 | Utility SysEx_ID | 0 | 127 | 0 |
| 77 | 859 | Utility PB_Range | 0 | 12 | 2 |
| 78 | 860 | Utility Trans | -4 | 4 | 0 |
| 79 | 861 | Utility KBSplit_AB | 0 | 1 | 0 |
| 80 | 862 | Utility KBSplit | 0 | 127 | 64 |
| 81 | 863 | Utility Tune | 840 | 920 | 0 |
| 82 | 865 | Utility GuitarInputGain | -31 | 24 | 0 |
| 83 | 866 | Utility GuitarMute | 0 | 1 | 0 |
| 84 | 868 | Utility Natplay_Global | 0 | 8 | 0 |
| 85 | 869 | Utility KeyScale_Global | 0 | 1 | 0 |
| 86 | 870 | Utility Tap_Global | 0 | 1 | 0 |
| 87 | 871 | Utility Dry_Delay | 0 | 2 | 0 |
| 88 | 872 | Utility USB_ROUTING | 0 | 2 | 1 |
| 89 | 873 | Utility Midi_Control | 0 | 2 | 0 |
| 90 | 874 | Utility Output_Level_Range | 0 | 5 | 0 |
| 91 | 875 | Utility Dry_Mute | 0 | 1 | 0 |
| 92 | 891 | Utility DemoMode | 0 | 1 | 0 |
| 93 | 892 | Utility GuitarFxStyle | 0 | 7 | 0 |
| 94 | 899 | Block Tone | 0 | 1 | 0 |
| 95 | 901 | Block GuitarFX | 0 | 1 | 0 |
| 96 | 961 | Utility Last_Preset | 0 | 65535 | 0 |
| 97 | 978 | Utility GuitarPhase | 0 | 1 | 0 |
| 98 | 983 | Utility Favorite | 0 | 4 | 0 |
| 99 | 984 | Utility Scene | 0 | 4 | 0 |
| 100 | 985 | Utility Advanced_Looping | 0 | 1 | 0 |
| 101 | 986 | Utility Undo_Enabled | 0 | 1 | 0 |
| 102 | 987 | Utility Pedal_Mode | 0 | 10 | 0 |
| 103 | 988 | Utility Scroll_Speed | 10 | 50 | 25 |
| 104 | 989 | Utility Loop_Rec_Decay | 0 | 100 | 50 |
| 105 | 990 | Utility MicButton | 0 | 4194304 | 0 |
| 106 | 1000 | Utility LoopGain | -61 | 0 | 0 |
| 107 | 1001 | Utility HarmButtonMode | 0 | 2 | 0 |

Setup data uses the same **25 × 28-bit parameters per message** layout as preset bulk dumps (`0x13`).

---

## Message ID quick index

| ID (hex) | ID (dec) | Name |
|----------|----------|------|
| `0x15` | 21 | Request Setup |
| `0x13` | 19 | Setup Data |
| `0x20` | 32 | Preset Header |
| `0x21` | 33 | Preset Data |
| `0x22` | 34 | Parameter Data |
| `0x23` | 35 | Activated Preset Info |
| `0x34` | 52 | Notification |
| `0x45` | 69 | Request Preset |
| `0x46` | 70 | Request Preset Header |
| `0x47` | 71 | Request Parameter |
| `0x50` | 80 | Presets Delete |
| `0x53` | 83 | Editor Mode |
