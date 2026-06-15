import { templateRegistry } from '../templates/registry';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import type { LastAction } from './StatusBadge';

interface DockStatusBarProps {
  lastAction: LastAction;
}

const STATUS: Record<LastAction, { label: string; cls: string }> = {
  idle: { label: 'Ready', cls: 'dock-status__pill--ready' },
  taken: { label: 'Live', cls: 'dock-status__pill--live' },
  cleared: { label: 'Cleared', cls: 'dock-status__pill--cleared' }
};

/**
 * Sticky top bar. Always answers "what am I working on and is it live?" at a
 * glance: app identity, the selected graphic's name, and a plain Ready / Live /
 * Cleared state pill. Stays pinned while the step area scrolls beneath it.
 */
export default function DockStatusBar({ lastAction }: DockStatusBarProps) {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const templateName = templateRegistry.find((item) => item.id === currentTemplateId)?.name ?? 'No graphic';
  const status = STATUS[lastAction];

  return (
    <header className="dock-status">
      <div className="dock-status__id">
        <span className="dock-status__logo">
          <img className="dock-status__logo-mark" src="/brand/livelayer-mark.svg" alt="" aria-hidden="true" />
          LiveLayer
        </span>
        <span className="dock-status__local" title="Running locally — ready">Local</span>
        <span className="dock-status__template" title={templateName}>{templateName}</span>
      </div>
      <span className={`dock-status__pill ${status.cls}`}>
        <span className="dock-status__pill-dot" aria-hidden />
        {status.label}
      </span>
    </header>
  );
}
