import type { SlotPort, PortState } from '../features/fiber/slotPorts';

const STATE_CLASS: Record<PortState, string> = {
  empty: 'bg-surface-2 text-content-faint',
  half: 'bg-warning-bg text-warning',
  full: 'bg-success-bg text-success',
};

const LEGEND: { state: PortState; label: string }[] = [
  { state: 'empty', label: '미연결' },
  { state: 'half', label: '편도' },
  { state: 'full', label: '양측' },
];

/** 정사각 포트 매트릭스(패치패널 식). 상태=배경색, 클릭=선택. 순수 표시. */
export function PortGrid({
  ports,
  selectedCore,
  onSelect,
  perRow = 12,
}: {
  ports: SlotPort[];
  selectedCore: number | null;
  onSelect: (coreNumber: number) => void;
  perRow?: number;
}) {
  return (
    <div className="space-y-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {ports.map((p) => (
          <button
            key={p.coreNumber}
            type="button"
            onClick={() => onSelect(p.coreNumber)}
            aria-label={`포트 ${p.coreNumber}`}
            aria-pressed={selectedCore === p.coreNumber}
            className={`aspect-square flex items-center justify-center rounded-[3px] text-[11px] font-mono tabular-nums transition-shadow ${
              STATE_CLASS[p.state]
            } ${selectedCore === p.coreNumber ? 'ring-2 ring-primary' : ''}`}
          >
            {p.coreNumber}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-content-muted">
        {LEGEND.map((l) => (
          <span key={l.state} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${STATE_CLASS[l.state].split(' ')[0]}`} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
