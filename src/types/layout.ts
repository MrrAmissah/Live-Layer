export type GraphicSize = 'small' | 'medium' | 'large';
export type GraphicPosition = 'left' | 'center' | 'full';
export type GraphicDensity = 'compact' | 'standard' | 'bold';
export type SafeMargin = 'normal' | 'tight';

export interface LayoutSettings {
  size?: GraphicSize;
  position?: GraphicPosition;
  density?: GraphicDensity;
  safeMargin?: SafeMargin;
}

export const DEFAULT_LAYOUT_SETTINGS: Required<LayoutSettings> = {
  size: 'medium',
  position: 'left',
  density: 'standard',
  safeMargin: 'normal'
};
