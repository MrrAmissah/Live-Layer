/**
 * Normalize a CSS colour to six-digit hex, or `undefined` when this build cannot.
 *
 * `themeToVars` copies a theme colour into `--gfx-*` without validating it, so a
 * legacy or imported graphic can paint `#fff`, `rgb(255 0 0)` or `red` — all of
 * which CSS resolves and none of which `<input type="color">` accepts. The
 * editor has to answer two different questions about such a value:
 *
 *  - what does the graphic PAINT? — the string itself, compared after passing
 *    through here so two spellings of one colour aren't reported as a change.
 *  - what does the colour PICKER show? — six-digit hex or nothing.
 *
 * Alpha is dropped for the PICKER rather than refused: `#11223344` paints a
 * translucent colour a colour input cannot express, and its RGB is a truer answer
 * than falling back to a template default. It is NOT dropped for comparison —
 * translucent red and opaque red are visibly different graphics — so
 * `comparableColor` keeps it as an eight-digit form. `transparent` and
 * `currentColor` are not colours a picker can stand in for at all, so they yield
 * nothing.
 *
 * Coverage is the machine-written formats plus the 16 basic named colours. An
 * exotic name (`rebeccapurple`) yields nothing here — the picker then shows its
 * fallback, while the comparison still uses the raw string, so an unrepresentable
 * colour is never silently reported as equal to something else.
 */

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB = /^rgba?\(([^)]+)\)$/i;
const HSL = /^hsla?\(([^)]+)\)$/i;

/** CSS Level 1 named colours — the ones a hand-edited import realistically holds. */
const NAMED: Record<string, string> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
  cyan: '#00ffff'
};

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const channelHex = (value: number): string => clampChannel(value).toString(16).padStart(2, '0');

const toHex = (r: number, g: number, b: number): string => `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;

/** An alpha channel as CSS states it: `0.5`, `50%`, or absent (opaque). */
const alphaValue = (raw: string | undefined): number => {
  const text = raw?.trim();
  if (!text) return 1;
  const percent = text.endsWith('%');
  const numeric = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0, Math.min(1, percent ? numeric / 100 : numeric));
};

/** `50%` → 127.5 of 255; a bare number stays as-is. */
const channelValue = (raw: string): number | undefined => {
  const text = raw.trim();
  if (!text) return undefined;
  const percent = text.endsWith('%');
  const numeric = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(numeric)) return undefined;
  return percent ? (numeric / 100) * 255 : numeric;
};

/** Split `rgb(1 2 3 / 40%)` and `rgb(1, 2, 3, 0.4)` alike. */
const splitChannels = (body: string): string[] =>
  body
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

function hslToHex(parts: string[]): string | undefined {
  const hueText = parts[0]?.replace(/deg$/i, '');
  const hue = Number.parseFloat(hueText ?? '');
  const saturation = Number.parseFloat((parts[1] ?? '').replace('%', ''));
  const lightness = Number.parseFloat((parts[2] ?? '').replace('%', ''));
  if (![hue, saturation, lightness].every(Number.isFinite)) return undefined;

  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [r1, g1, b1] =
    huePrime < 1
      ? [chroma, second, 0]
      : huePrime < 2
        ? [second, chroma, 0]
        : huePrime < 3
          ? [0, chroma, second]
          : huePrime < 4
            ? [0, second, chroma]
            : huePrime < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const match = l - chroma / 2;
  return toHex((r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255);
}

/** Hex plus alpha, or nothing when this build cannot read the notation. */
function parseCssColor(value: string | undefined): { hex: string; alpha: number } | undefined {
  const text = value?.trim();
  if (!text) return undefined;

  const named = NAMED[text.toLowerCase()];
  if (named) return { hex: named, alpha: 1 };

  const hex = HEX.exec(text);
  if (hex) {
    const digits = hex[1].toLowerCase();
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = [...digits.slice(0, 3)];
      const alpha = digits.length === 4 ? parseInt(digits[3] + digits[3], 16) / 255 : 1;
      return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha };
    }
    if (digits.length === 6 || digits.length === 8) {
      const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
      return { hex: `#${digits.slice(0, 6)}`, alpha };
    }
    return undefined;
  }

  const rgb = RGB.exec(text);
  if (rgb) {
    const parts = splitChannels(rgb[1]);
    const channels = parts.slice(0, 3).map(channelValue);
    if (channels.length < 3 || channels.some((part) => part === undefined)) return undefined;
    return { hex: toHex(channels[0]!, channels[1]!, channels[2]!), alpha: alphaValue(parts[3]) };
  }

  const hsl = HSL.exec(text);
  if (hsl) {
    const parts = splitChannels(hsl[1]);
    const converted = hslToHex(parts);
    return converted ? { hex: converted, alpha: alphaValue(parts[3]) } : undefined;
  }

  return undefined;
}

/** Six-digit hex for a colour control. Alpha is dropped — see the module note. */
export function normalizeCssColorToHex(value: string | undefined): string | undefined {
  return parseCssColor(value)?.hex;
}

/**
 * The comparable form of a colour the renderer paints: normalized where this
 * build can, and the lowercased raw string otherwise — so an unrepresentable
 * colour compares as itself rather than as some fallback.
 *
 * Alpha is preserved as an eight-digit suffix, because translucent red and
 * opaque red are different graphics. Opaque colours keep the plain six-digit
 * form so nothing that used to compare equal stops doing so.
 */
export function comparableColor(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return '';
  const parsed = parseCssColor(text);
  if (!parsed) return text.toLowerCase();
  if (parsed.alpha >= 1) return parsed.hex;
  return `${parsed.hex}${channelHex(parsed.alpha * 255)}`;
}
