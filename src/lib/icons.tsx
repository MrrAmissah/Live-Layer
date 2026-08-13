import type { SVGProps } from 'react';

/**
 * Dependency-free inline-SVG icon set for the control surface. One reusable
 * component instead of raw SVG scattered per file. Stroke-based, 24px grid,
 * inherits `currentColor` so a caller controls colour via CSS.
 *
 * Accessibility: icons are decorative by default (aria-hidden). For an
 * icon-only button, put the accessible name on the BUTTON (aria-label), not
 * here. Passing a `title` promotes the icon to an img with that label.
 */

const PATHS = {
  // Microphone — the live capture control. A real icon, not an emoji: this sits
  // beside Take on an operator surface and has to match its weight.
  mic: <><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v3" /><path d="M8 21h8" /></>,
  micOff: <><path d="M9 5a3 3 0 0 1 6 0v4" /><path d="M15 13.5a3 3 0 0 1-6-1.5V9" /><path d="M5 10v1a7 7 0 0 0 10.6 6" /><path d="M19 11v-1" /><path d="M12 18v3" /><path d="M8 21h8" /><path d="M3 3l18 18" /></>,
  // Broadcast / Take — signal waves
  broadcast: <><path d="M4.9 19.1a10 10 0 0 1 0-14.2" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M19.1 4.9a10 10 0 0 1 0 14.2" /><circle cx="12" cy="12" r="2" /></>,
  // Clear — circle with slash
  clear: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  // Queue / list
  queue: <><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  // Live dot ring
  live: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>,
  // Edit / pencil
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  // More — horizontal dots
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  // Drag handle — 2x3 dots
  dragHandle: <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  // Overflow — vertical dots
  overflow: <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V1a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 17 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  previewOutput: <><rect x="2.5" y="4" width="19" height="13" rx="1.5" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v5h-5" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 3v5h5" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  chevronUpDown: <><path d="M8 9l4-4 4 4" /><path d="M8 15l4 4 4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  layers: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  // Template-type icons
  type: <><path d="M4 7V5h16v2" /><path d="M9 5v14" /><path d="M7 19h4" /><path d="M14 11v-1h6v1" /><path d="M17 10v9" /><path d="M15.5 19h3" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" /><path d="M4 5v14" /></>,
  quote: <><path d="M7 7c-2 .5-3 2-3 4v4h5v-5H6c0-1 .5-2 2-2.3Z" fill="currentColor" stroke="none" /><path d="M17 7c-2 .5-3 2-3 4v4h5v-5h-3c0-1 .5-2 2-2.3Z" fill="currentColor" stroke="none" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M16 8a4 4 0 0 1 0 8" /></>,
  message: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21l4-3 4 3" /></>,
  // Connection status
  plug: <><path d="M9 2v6" /><path d="M15 2v6" /><path d="M7 8h10v3a5 5 0 0 1-10 0Z" /><path d="M12 16v6" /></>,
  // Nav destinations
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" /></>,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
  // Lower-third position glyphs (bar sits low, aligned)
  posLeft: <><rect x="3" y="4" width="18" height="16" rx="1.5" opacity="0.5" /><rect x="6" y="14" width="8" height="3" rx="1" fill="currentColor" stroke="none" /></>,
  posCenter: <><rect x="3" y="4" width="18" height="16" rx="1.5" opacity="0.5" /><rect x="8" y="14" width="8" height="3" rx="1" fill="currentColor" stroke="none" /></>,
  posFull: <><rect x="3" y="4" width="18" height="16" rx="1.5" opacity="0.5" /><rect x="6" y="14" width="12" height="3" rx="1" fill="currentColor" stroke="none" /></>,
  play: <path d="M7 5v14l11-7-11-7Z" fill="currentColor" stroke="none" />,
  filter: <><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></>,
  /* The three output screens, drawn as what each one IS: a full frame, a frame
     with a band across its foot, and a frame split camera-left / panel-right.
     An operator matching a card to an OBS source reads the shape before the
     label, which is the whole reason these are not all the same monitor glyph. */
  screenMain: <><rect x="2.5" y="4" width="19" height="14" rx="1.5" /><path d="M8 21h8" /><path d="M12 18v3" /></>,
  screenLower: <><rect x="2.5" y="4" width="19" height="14" rx="1.5" /><rect x="5" y="12.5" width="14" height="3" rx="1" fill="currentColor" stroke="none" /><path d="M8 21h8" /><path d="M12 18v3" /></>,
  screenSplit: <><rect x="2.5" y="4" width="19" height="14" rx="1.5" /><path d="M11.5 4v14" /><rect x="13.5" y="6.5" width="6" height="9" rx="1" fill="currentColor" stroke="none" opacity="0.55" /><path d="M8 21h8" /><path d="M12 18v3" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  /* The house screen is a projector throwing onto a wall, not a monitor — the
     shape says "in the room" before the label does. */
  screenHouse: <><rect x="3" y="3.5" width="18" height="12" rx="1" /><path d="M12 15.5v3" /><path d="M6.5 21.5 12 18.5l5.5 3" /></>
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** When set, the icon is announced with this label instead of hidden. */
  title?: string;
}

export function Icon({ name, size = 18, title, ...rest }: IconProps) {
  return (
    <svg
      className="ll-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
