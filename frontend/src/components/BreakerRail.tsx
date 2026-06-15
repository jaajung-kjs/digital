import type { FeederCircuit } from '../features/power/feederCircuits';

const isOn = (s: string) => s.toUpperCase() === 'ON';

/** 차단기 DIN 레일 — 가로 배열 차단기 모듈(번호 + 개폐 토글 + 용량). 색=개폐상태. 순수 표시. */
export function BreakerRail({
  circuits,
  selectedCb,
  onSelect,
  onToggle,
}: {
  circuits: FeederCircuit[];
  selectedCb: number | null;
  onSelect: (cbNumber: number) => void;
  onToggle: (cbNumber: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-2">
      {circuits.map((c) => {
        const on = c.occupied && isOn(c.switchState);
        const stateCls = !c.occupied
          ? 'border border-dashed border-line text-content-faint'
          : on
            ? 'bg-success-bg text-success'
            : 'bg-surface text-content-muted';
        return (
          <button
            key={c.cbNumber}
            type="button"
            onClick={() => onSelect(c.cbNumber)}
            aria-label={`차단기 ${c.cbNumber}`}
            aria-pressed={selectedCb === c.cbNumber}
            className={`relative flex w-9 flex-col items-center gap-1 rounded-[3px] py-1.5 transition-shadow ${stateCls} ${
              selectedCb === c.cbNumber ? 'ring-2 ring-primary' : ''
            }`}
          >
            <span className="text-[9px] font-mono tabular-nums leading-none">{c.cbNumber}</span>
            <span
              role={c.occupied ? 'button' : undefined}
              aria-label={c.occupied ? `차단기 ${c.cbNumber} 개폐` : undefined}
              onClick={(e) => { if (c.occupied) { e.stopPropagation(); onToggle(c.cbNumber); } }}
              className={`block h-5 w-2.5 rounded-[2px] ${
                !c.occupied ? 'bg-surface-2' : on ? 'bg-success' : 'bg-content-faint'
              }`}
            />
            <span className="text-[8px] leading-none opacity-70">{c.occupied ? c.capacity || '·' : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}
