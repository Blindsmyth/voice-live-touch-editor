/** Short UI hints for non-obvious parameter sections (shown in the editor). */
export const PARAMETER_SECTION_HELP: Record<string, string> = {
  "EQ Voice":
    "Manual parametric EQ for the lead vocal (SysEx ParEq * Voice). On VoiceLive Touch, Setup → Tone Style does not switch to manual EQ — values 1–8 are adaptive Shape/comp/de-ess/gate presets; 0 = Off. Unlike VoiceLive 2, Touch has no Adaptive-off EQ tab in the UI. These sliders may have little audible effect on Touch; Tone Style 0 + Block Tone On is worth trying for testing.",
  "EQ Guitar":
    "Manual parametric EQ for the guitar path (global). Used when guitar tone is in manual EQ mode on the device.",
  "Tone & routing":
    "Tone block bypass (Block Tone) and Tone Style (Setup item 2). Style 0 = Off; 1–8 = adaptive tone presets (Normal, Less Bright, etc.) — not manual parametric EQ.",
  "Effect on/off":
    "Bypass toggles from Setup → Effect blocks (and related globals). Same IDs as the Setup group — changes apply everywhere that control is shown.",
  "Levels & sends":
    "Mixer levels duplicated here for convenience — same SysEx IDs as the Mixer group. Changes apply everywhere.",
  "Custom scale map":
    "Used when Harmony Scale = Custom. Pick a scale degree, then set each voice’s output on the piano roll (semitone steps from −2 oct to +2 oct, or N/C). SysEx stores two voices per 12-bit word (V1+V2, V3+V4). Equal temperament only — no per-note cent tuning.",
};
