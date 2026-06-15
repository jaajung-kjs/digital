import type { FeederCircuit } from '../features/power/feederCircuits';

const isOn = (s: string) => s.toUpperCase() === 'ON';

/**
 * 차단기 DIN 레일 — 6열 고정 그리드(랙 슬롯 동형). 빈 자리는 "＋" 추가 버튼(onAddCb):
 * 클릭하면 평면도에서 케이블을 그려 CB(피더→부하)를 만든다. 점유 차단기는 실제 스위치처럼
 * ON=레버 위 / OFF=레버 아래로 내려간 토글 + hover 삭제(onDeleteCb). 순수 표시.
 * `circuits` 는 feederGridSlots 로 만든 고정 그리드(점유+빈 슬롯)를 그대로 받는다.
 * 타이포: 번호=text-xs, 용량=text-[11px] (CONVENTIONS.md 스케일 — text-xs 미만 지양).
 */
export function BreakerRail({
  circuits,
  selectedCb,
  onSelect,
  onToggle,
  onAddCb,
  onDeleteCb,
}: {
  circuits: FeederCircuit[];
  selectedCb: number | null;
  onSelect: (cbNumber: number) => void;
  onToggle: (cbNumber: number) => void;
  onAddCb?: () => void;
  onDeleteCb?: (cbNumber: number, cableId: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 rounded-md border border-line bg-surface-2 p-2 shadow-inner">
      {circuits.map((c) => {
        // 빈 자리 = 추가 버튼(랙/OFD 빈 슬롯 동형). 클릭 → 평면도 케이블 그리기.
        if (!c.occupied) {
          return (
            <button
              key={c.cbNumber}
              type="button"
              onClick={onAddCb}
              disabled={!onAddCb}
              aria-label={`차단기 ${c.cbNumber} 추가`}
              className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-surface/40 text-content-faint transition-colors hover:border-primary hover:text-primary hover:bg-info-bg disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface/40 disabled:hover:text-content-faint"
            >
              <span className="text-[11px] font-mono tabular-nums leading-none opacity-60">{c.cbNumber}</span>
              <span className="text-lg leading-none" aria-hidden="true">＋</span>
            </button>
          );
        }
        const on = isOn(c.switchState);
        const selected = selectedCb === c.cbNumber;
        // 물리 차단기 모듈처럼 — 항상 흰 바디 + 그림자, 상태는 테두리·스위치·용량 색으로(배경 도배 X).
        const borderCls = selected
          ? 'border-primary ring-2 ring-primary/30'
          : on
            ? 'border-success/45 hover:border-success/70'
            : 'border-line hover:border-content-faint';
        return (
          <div
            key={c.cbNumber}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.cbNumber)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.cbNumber); } }}
            aria-label={`차단기 ${c.cbNumber}`}
            aria-current={selected ? 'true' : undefined}
            className={`group relative flex min-h-[4.25rem] flex-col items-center justify-between gap-1 rounded-md border bg-surface py-1.5 shadow-sm cursor-pointer transition-[box-shadow,border-color] duration-150 hover:shadow-md ${borderCls}`}
          >
            <span className={`text-xs font-mono font-medium tabular-nums leading-none ${on ? 'text-content' : 'text-content-muted'}`}>{c.cbNumber}</span>
            {/* 실제 차단기 레버 — 리세스 슬롯 안의 노브가 ON=위 / OFF=아래로 이동. */}
            <button
              type="button"
              aria-label={`차단기 ${c.cbNumber} 개폐`}
              onClick={(e) => { e.stopPropagation(); onToggle(c.cbNumber); }}
              title={on ? 'ON — 클릭해 차단' : 'OFF — 클릭해 투입'}
              className={`relative h-8 w-5 rounded-full border shadow-inner transition-colors ${
                on ? 'border-success/50 bg-success-bg' : 'border-line bg-surface-2'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border shadow-sm transition-all duration-200 ${
                  on ? 'top-[3px] border-success bg-success' : 'top-[15px] border-line bg-surface'
                }`}
              />
            </button>
            <span className={`text-[11px] font-medium leading-none ${on ? 'text-success' : 'text-content-muted'}`}>{c.capacity || '·'}</span>
            {onDeleteCb && c.cableId && (
              <button
                type="button"
                aria-label={`차단기 ${c.cbNumber} 삭제`}
                onClick={(e) => { e.stopPropagation(); onDeleteCb(c.cbNumber, c.cableId!); }}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
