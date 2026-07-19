import type { LayoutSettings } from './layout';

export type TemplateFieldType = 'text' | 'textarea' | 'color' | 'url';

export interface TemplateField {
  id: string;
  label: string;
  type: TemplateFieldType;
  placeholder?: string;
  optional?: boolean;
  rows?: number;
  /** Hard character cap — the denominator of the "17 / 60" content counter. */
  maxLength?: number;
  /** Soft guidance; the counter warns past this without blocking input. */
  recommendedLength?: number;
}

export interface TemplateTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor?: string;
  /** Secondary accent (stripes/keylines) for output graphics. Optional + defaulted, so older stored presets stay valid. */
  accent2Color?: string;
  /** Optional theme-level logo reference; templates currently keep logoAssetId in values for preset compatibility. */
  logoAssetId?: string;
}

export interface TemplateAnimation {
  in: 'fade' | 'slide' | 'grow';
  out: 'fade' | 'slide' | 'shrink';
}

export interface TemplateVariant {
  id: string;
  name: string;
  description: string;
  /**
   * Signature colors for this design. Selecting the variant loads these into
   * the draft's color fields so the palette editor always corresponds to the
   * look on screen; the operator can still tweak each swatch afterwards.
   */
  palette?: Record<string, string>;
}

/** Normalized classification for icons and UI grouping, independent of the
 *  free-text `category` label. Inferred by getTemplateDisplayCategory until
 *  each definition is explicitly migrated. */
export type TemplateDisplayCategory = 'lowerThird' | 'card' | 'banner' | 'fullscreen';

/**
 * What a template's renderer *actually supports today*. Editors read this to
 * decide which controls to expose — never to advertise behaviour the renderer
 * doesn't have. Optional: absent means "infer from current behaviour".
 */
export interface TemplateCapabilities {
  logo: boolean;
  logoRemoval: boolean;
  appearance: Array<'main' | 'accent' | 'text' | 'surface' | 'secondary'>;
  positions: Array<'left' | 'center' | 'full' | 'top' | 'bottom'>;
  sizes: Array<'small' | 'medium' | 'large'>;
  autoHide: boolean;
  motion: boolean;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: TemplateField[];
  defaultValues: Record<string, string>;
  theme: TemplateTheme;
  variants?: TemplateVariant[];
  animation?: TemplateAnimation;
  /**
   * Auto-hide default applied when the operator switches to this template
   * (0 = manual/off). Templates without one keep the operator's current
   * setting.
   */
  defaultDurationSeconds?: number;
  /**
   * The field that most identifies a graphic of this template — quick-add
   * writes typed names here and queue/preset labels read it first.
   */
  primaryField?: string;
  /** Normalized class for icons/grouping; inferred when absent. */
  displayCategory?: TemplateDisplayCategory;
  /** Renderer-backed capability flags; populated as editors consume them. */
  capabilities?: TemplateCapabilities;
  /** Preview aspect ratio hint, e.g. '16 / 3' lower third, '16 / 9' card. */
  previewAspectRatio?: string;
}

export interface GraphicInstance {
  id: string;
  templateId: string;
  presetName?: string;
  values: Record<string, string>;
  theme: Partial<TemplateTheme>;
  assetRefs?: Record<string, string>;
  personId?: string;
  layout?: LayoutSettings;
  animationOverride?: Partial<TemplateAnimation>;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Monotonic optimistic-concurrency counter. Guaranteed present on quick-queue
   * items (see QuickQueueItem); legacy stored items normalize to 1 on load.
   * Optional here so presets/recent stay valid without a migration.
   */
  revision?: number;
}

/**
 * A quick-queue entry — a GraphicInstance with a stable `q-` id and a
 * guaranteed monotonic `revision`. updateQuickQueueItem checks an
 * expectedRevision and bumps it once per successful write, so a second client's
 * change can't be silently overwritten.
 */
export type QuickQueueItem = GraphicInstance & { revision: number };

export type RealtimeMessageType =
  | 'SHOW_GRAPHIC'
  | 'HIDE_GRAPHIC'
  | 'CLEAR_ALL'
  | 'UPDATE_PREVIEW'
  | 'LOAD_PRESET'
  | 'SET_THEME';

export interface ShowGraphicMessage {
  id: string;
  type: 'SHOW_GRAPHIC';
  payload: GraphicInstance;
  timestamp: number;
}

export interface HideGraphicMessage {
  id: string;
  type: 'HIDE_GRAPHIC';
  payload: { id: string };
  timestamp: number;
}

export interface ClearAllMessage {
  id: string;
  type: 'CLEAR_ALL';
  payload: Record<string, never>;
  timestamp: number;
}

export interface UpdatePreviewMessage {
  id: string;
  type: 'UPDATE_PREVIEW';
  payload: GraphicInstance;
  timestamp: number;
}

export interface LoadPresetMessage {
  id: string;
  type: 'LOAD_PRESET';
  payload: GraphicInstance;
  timestamp: number;
}

export interface SetThemeMessage {
  id: string;
  type: 'SET_THEME';
  payload: TemplateTheme;
  timestamp: number;
}

export type RealtimeMessage =
  | ShowGraphicMessage
  | HideGraphicMessage
  | ClearAllMessage
  | UpdatePreviewMessage
  | LoadPresetMessage
  | SetThemeMessage;
