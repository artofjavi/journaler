import { useSettingsStore } from "@/store/settings-store";
import type { AccentColor, PresetAccentColor } from "@shared/types/accent-color";
import { watch } from "vue";

interface AccentPalette {
  300: string;
  500: string;
  700: string;
}

// RGB values for Tailwind colors at different intensities
export const PRESET_ACCENT_COLORS: Record<PresetAccentColor, AccentPalette> = {
  green: {
    300: "134 239 172",
    500: "34 197 94",
    700: "21 128 61"
  },
  blue: {
    300: "147 197 253",
    500: "59 130 246",
    700: "29 78 216"
  },
  red: {
    300: "252 165 165",
    500: "239 68 68",
    700: "185 28 28"
  },
  orange: {
    300: "253 186 116",
    500: "249 115 22",
    700: "194 65 12"
  },
  yellow: {
    300: "253 224 71",
    500: "234 179 8",
    700: "161 98 7"
  },
  purple: {
    300: "216 180 254",
    500: "168 85 247",
    700: "126 34 206"
  }
};

export const PRESET_ACCENT_HEX: Record<PresetAccentColor, string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  purple: "#a855f7"
};

function parseHexToRgb(hex: string): [number, number, number] | null {
  const trimmed = hex.trim();
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortMatch && shortMatch[1]) {
    const [r, g, b] = shortMatch[1].split("").map((ch) => parseInt(ch + ch, 16));
    return [r ?? 0, g ?? 0, b ?? 0];
  }

  const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (fullMatch && fullMatch[1]) {
    const val = fullMatch[1];
    return [
      parseInt(val.slice(0, 2), 16),
      parseInt(val.slice(2, 4), 16),
      parseInt(val.slice(4, 6), 16)
    ];
  }

  return null;
}

function mixChannel(a: number, b: number, weightB: number): number {
  return Math.round(a * (1 - weightB) + b * weightB);
}

function buildPaletteFromRgb([r, g, b]: [number, number, number]): AccentPalette {
  const light = [mixChannel(r, 255, 0.48), mixChannel(g, 255, 0.48), mixChannel(b, 255, 0.48)];
  const dark = [mixChannel(r, 0, 0.3), mixChannel(g, 0, 0.3), mixChannel(b, 0, 0.3)];

  return {
    300: `${light[0]} ${light[1]} ${light[2]}`,
    500: `${r} ${g} ${b}`,
    700: `${dark[0]} ${dark[1]} ${dark[2]}`
  };
}

function parseRgbTriplet(triplet: string): [number, number, number] {
  const parts = triplet.split(/\s+/).map((n) => Number(n));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function blendOverSurface(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number]
): [number, number, number] {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha))
  ];
}

function resolvePalette(color: AccentColor): AccentPalette {
  if (color in PRESET_ACCENT_COLORS) {
    return PRESET_ACCENT_COLORS[color as PresetAccentColor];
  }

  const rgb = parseHexToRgb(color);
  if (rgb) {
    return buildPaletteFromRgb(rgb);
  }

  return PRESET_ACCENT_COLORS.blue;
}

const applyAccentColor = (color: AccentColor) => {
  const colors = resolvePalette(color);
  const root = document.documentElement.style;

  root.setProperty("--accent-300", colors[300]);
  root.setProperty("--accent-500", colors[500]);
  root.setProperty("--accent-700", colors[700]);

  const solidRgb = parseRgbTriplet(colors[500]);
  const todayFg = relativeLuminance(solidRgb) > 0.36 ? "9 9 11" : "255 255 255";
  root.setProperty("--accent-today-fg", todayFg);

  const tintRgb = parseRgbTriplet(colors[300]);
  const lightSurface = blendOverSurface(tintRgb, 0.55, [244, 244, 245]); // zinc-100
  const darkSurface = blendOverSurface(tintRgb, 0.55, [24, 24, 27]); // zinc-900

  root.setProperty(
    "--accent-entry-fg",
    relativeLuminance(lightSurface) > 0.34 ? "39 39 42" : "250 250 250"
  );
  root.setProperty(
    "--accent-entry-dark-fg",
    relativeLuminance(darkSurface) > 0.34 ? "24 24 27" : "250 250 250"
  );
};

export const useAccentColor = () => {
  const settingsStore = useSettingsStore();

  applyAccentColor(settingsStore.accentColor);

  watch(
    () => settingsStore.accentColor,
    (newColor) => {
      applyAccentColor(newColor);
    }
  );

  return {};
};
