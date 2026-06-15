import type { SlotPort, PortState } from '../features/fiber/slotPorts';

// 포트 타일 — 상태별 표면/테두리/글자색(물리 패치패널 모듈 느낌). 범례 스와치도 동일 클래스 재사용.
const TILE_CLASS: Record<PortState, string> = {
  empty: 'bg-surface border-line text-content-faint',
  half: 'bg-warning-bg border-warning/40 text-warning',
  full: 'bg-success-bg border-success/50 text-success',
};
// 연결 상태 LED(미연결은 없음).
const LED_CLASS: Record<PortState, string> = {
  empty: '',
  half: 'bg-warning',
  full: 'bg-success',
};

const LEGEND: { state: PortState; label: string }[] = [
  { state: 'empty', label: '미연결' },
  { state: 'half', label: '편도' },
  { state: 'full', label: '양측' },
];

/** 정사각 포트 매트릭스(광 패치패널/ODF 식). 백플레인 위에 포트 모듈 + 연결 LED. 순수 표시. */
export function PortGrid({
  ports,
  selectedCore,
  onSelect,
  perRow = 12,
  dimOccupied = false,
}: {
  ports: SlotPort[];
  selectedCore: number | null;
  onSelect: (coreNumber: number) => void;
  perRow?: number;
  /** 케이블 피킹 모드: 자국 측 이미 점유된(localCableId 있음) 포트는 픽 불가 → 흐리게. */
  dimOccupied?: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* 백플레인 프레임 — 차단기 레일과 동일한 디자인 언어(border + bg-surface-2 + recessed shadow-inner). */}
      <div className="rounded-md border border-line bg-surface-2 p-2 shadow-inner">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
        >
          {ports.map((p) => {
            const selected = selectedCore === p.coreNumber;
            const dimmed = dimOccupied && !!p.localCableId; // 자국 점유 → 픽 불가
            return (
              <button
                key={p.coreNumber}
                type="button"
                onClick={() => onSelect(p.coreNumber)}
                aria-label={`포트 ${p.coreNumber}`}
                aria-pressed={selected}
                className={`relative flex aspect-square items-center justify-center rounded-md border text-[11px] font-mono font-medium tabular-nums shadow-sm transition-colors ${
                  TILE_CLASS[p.state]
                } ${selected ? 'z-10 border-primary ring-2 ring-primary/40' : 'hover:border-content-faint'} ${dimmed ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {p.coreNumber}
                {p.state !== 'empty' && (
                  <span
                    aria-hidden="true"
                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${LED_CLASS[p.state]}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-content-muted">
        {LEGEND.map((l) => (
          <span key={l.state} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border ${TILE_CLASS[l.state]}`} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
