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
 * Alpha is dropped rather than refused: `#11223344` paints a translucent colour
 * that a picker cannot express, and its RGB is a truer answer than falling back
 * to a template default. `transparent` and `currentColor` are not colours a
 * picker can stand in for at all, so they yield nothing.
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

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;

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

export function normalizeCssColorToHex(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;

  const named = NAMED[text.toLowerCase()];
  if (named) return named;

  const hex = HEX.exec(text);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = [...digits.slice(0, 3)];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (digits.length === 6 || digits.length === 8) return `#${digits.slice(0, 6)}`.toLowerCase();
    return undefined;
  }

  const rgb = RGB.exec(text);
  if (rgb) {
    const parts = splitChannels(rgb[1]).slice(0, 3).map(channelValue);
    if (parts.length < 3 || parts.some((part) => part === undefined)) return undefined;
    return toHex(parts[0]!, parts[1]!, parts[2]!);
  }

  const hsl = HSL.exec(text);
  if (hsl) return hslToHex(splitChannels(hsl[1]));

  return undefined;
}

/**
 * The comparable form of a colour the renderer paints: normalized where this
 * build can, and the lowercased raw string otherwise — so an unrepresentable
 * colour compares as itself rather than as some fallback.
 */
export function comparableColor(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return '';
  return normalizeCssColorToHex(text) ?? text.toLowerCase();
}
