import type { FeederCircuit } from '../features/power/feederCircuits';

const isOn = (s: string) => s.toUpperCase() === 'ON';

/**
 * 차단기 DIN 레일 — 가로 배열 차단기 모듈(번호 + 개폐 토글 + 용량). 색=개폐상태. 순수 표시.
 * 빈 자리는 랙/OFD 빈 슬롯처럼 "＋" 추가 버튼(onAddCb) — 클릭하면 평면도에서 케이블을 그려
 * CB(피더→부하)를 만든다. 점유 차단기는 hover 시 삭제(onDeleteCb).
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
    <div className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-2">
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
              className="flex w-9 min-w-9 flex-col items-center justify-center gap-0.5 rounded-[3px] border border-dashed border-line py-1.5 text-content-faint transition-colors hover:border-primary hover:text-primary hover:bg-info-bg disabled:cursor-default disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-content-faint"
            >
              <span className="text-[9px] font-mono tabular-nums leading-none">{c.cbNumber}</span>
              <span className="text-sm leading-none" aria-hidden="true">＋</span>
            </button>
          );
        }
        const on = isOn(c.switchState);
        const stateCls = on ? 'bg-success-bg text-success' : 'bg-surface text-content-muted';
        return (
          <div
            key={c.cbNumber}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.cbNumber)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.cbNumber); } }}
            aria-label={`차단기 ${c.cbNumber}`}
            aria-current={selectedCb === c.cbNumber ? 'true' : undefined}
            className={`group relative flex w-9 min-w-9 flex-col items-center gap-1 rounded-[3px] py-1.5 cursor-pointer transition-shadow ${stateCls} ${
              selectedCb === c.cbNumber ? 'ring-2 ring-primary' : ''
            }`}
          >
            <span className="text-[9px] font-mono tabular-nums leading-none">{c.cbNumber}</span>
            <button
              type="button"
              aria-label={`차단기 ${c.cbNumber} 개폐`}
              onClick={(e) => { e.stopPropagation(); onToggle(c.cbNumber); }}
              className={`block h-5 w-2.5 rounded-[2px] ${on ? 'bg-success' : 'bg-content-faint'}`}
            />
            <span className="text-[8px] leading-none opacity-70">{c.capacity || '·'}</span>
            {onDeleteCb && c.cableId && (
              <button
                type="button"
                aria-label={`차단기 ${c.cbNumber} 삭제`}
                onClick={(e) => { e.stopPropagation(); onDeleteCb(c.cbNumber, c.cableId!); }}
                className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line bg-surface text-[9px] leading-none text-danger opacity-0 transition-opacity hover:bg-danger-bg group-hover:opacity-100"
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
