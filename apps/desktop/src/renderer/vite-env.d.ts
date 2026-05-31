/// <reference types="vite/client" />

import type { PresetLibraryApi } from "../preload/index.js";

declare global {
  interface Window {
    presetLibrary: PresetLibraryApi;
  }
}

export {};
