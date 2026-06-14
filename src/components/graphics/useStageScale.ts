import { useEffect, useRef, useState } from 'react';
import { STAGE_WIDTH, STAGE_HEIGHT } from './stage';

interface StageScale {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Measures a viewport element and returns the uniform scale + letterbox
 * offsets needed to fit the fixed 1920x1080 stage inside it.
 * `scale = min(vw / 1920, vh / 1080)`; the stage uses
 * `transform-origin: top left` with a translate for centering.
 */
export function useStageScale<T extends HTMLElement>() {
  const viewportRef = useRef<T | null>(null);
  const [stageScale, setStageScale] = useState<StageScale>({ scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const scale = Math.min(rect.width / STAGE_WIDTH, rect.height / STAGE_HEIGHT) || 0;
      setStageScale({
        scale,
        offsetX: (rect.width - STAGE_WIDTH * scale) / 2,
        offsetY: (rect.height - STAGE_HEIGHT * scale) / 2
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { viewportRef, ...stageScale };
}
