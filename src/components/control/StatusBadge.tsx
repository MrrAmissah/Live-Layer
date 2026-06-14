export type LastAction = 'idle' | 'taken' | 'cleared';

interface StatusBadgeProps {
  status: LastAction;
}

const MAP: Record<LastAction, { label: string; cls: string }> = {
  taken: { label: 'On air', cls: 'status--live' },
  cleared: { label: 'Cleared', cls: 'status--cleared' },
  idle: { label: 'Standby', cls: 'status--ready' }
};

/** Live state pill. The pulsing dot reads as "on air" at a glance. */
export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, cls } = MAP[status];
  return (
    <span className={`status ${cls}`}>
      <span className="status__dot" aria-hidden />
      {label}
    </span>
  );
}
