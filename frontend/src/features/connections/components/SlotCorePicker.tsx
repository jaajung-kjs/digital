import { useMemo, useState } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useTraceGraph, remoteSlotSubstation } from '../../trace/traceGraph';
import { buildSlotCoreRows } from '../../fiber/slotRegister';
import { nextFreeCore } from '../../fiber/fiberWrite';
import type { Asset } from '../../../types/asset';

/**
 * P6 Task 2: OFD 드롭 시 코어 엔드포인트 피커.
 * OFD 의 슬롯(경로) 목록을 탭으로 표시하고, 코어 번호 그리드로 선택.
 * 점유 코어는 비활성, 다음 빈 코어는 자동 강조.
 * 확정 시 onSelect({ slotId, coreNumber }) 호출 — endpoint assetId = slotId.
 */
export function SlotCorePicker({
  ofdId,
  onSelect,
  onCancel,
}: {
  ofdId: string;
  onSelect: (sel: { slotId: string; coreNumber: number }) => void;
  onCancel: () => void;
}) {
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables();
  const { graph } = useTraceGraph();

  const slots = useMemo(
    () => assets.filter((a) => a.parentAssetId === ofdId && a.assetType?.connectionKind === 'conduit'),
    [assets, ofdId],
  );

  // pickedSlotId: null = 아직 선택 안 함(최초엔 slots[0] 으로 폴백).
  // slots 가 비동기로 hydrate 돼도 slotId 가 stale 안 되게.
  const [pickedSlotId, setPickedSlotId] = useState<string | null>(null);
  const slotId = pickedSlotId ?? slots[0]?.id ?? null;

  const rows = useMemo(() => {
    const slot = slots.find((s) => s.id === slotId);
    return slot ? buildSlotCoreRows(slot as never, cables as never[], graph) : [];
  }, [slots, slotId, cables, graph]);

  const occupied = rows.filter((r) => r.occupied).map((r) => r.coreNumber);
  const capacity = rows.length || 24;
  const suggested = nextFreeCore(occupied, capacity);

  if (!slots.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
        <div className="bg-surface rounded-lg shadow-xl w-[380px] p-6 space-y-3">
          <h3 className="text-sm font-semibold text-content">코어 선택</h3>
          <p className="text-sm text-content-faint">
            이 OFD 에 광 경로가 없습니다. OFD 상세의 &quot;경로 추가&quot;로 대국 트렁크를 먼저 만드세요.
          </p>
          <div className="flex justify-end">
            <button
              className="text-xs px-3 py-1.5 rounded border border-line text-content-muted hover:bg-surface-2 transition-colors"
              onClick={onCancel}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
      <div className="bg-surface rounded-lg shadow-xl w-[420px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-content">코어 선택</h3>
            <p className="text-xs text-content-muted mt-0.5">경로(슬롯) 선택 후 코어 번호를 클릭하세요</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 text-content-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="닫기 (ESC)"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 슬롯(경로) 탭 */}
          <div>
            <div className="text-[11px] text-content-faint mb-1.5">경로 (슬롯)</div>
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => {
                const label = (graph && remoteSlotSubstation(s.id, graph)) ?? s.name;
                const active = slotId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPickedSlotId(s.id)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active
                        ? 'border-primary bg-info-bg text-primary'
                        : 'border-line text-content-muted hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 코어 번호 그리드 */}
          {rows.length > 0 && (
            <div>
              <div className="text-[11px] text-content-faint mb-1.5">
                코어 번호
                <span className="ml-1 text-primary">({suggested}번 다음 빈 코어)</span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {rows.map((r) => (
                  <button
                    key={r.coreNumber}
                    type="button"
                    disabled={r.occupied}
                    onClick={() => slotId && onSelect({ slotId, coreNumber: r.coreNumber })}
                    title={
                      r.occupied
                        ? `사용 중${r.farName ? `: ${r.farName}` : ''}`
                        : `코어 ${r.coreNumber}${r.coreNumber === suggested ? ' (추천)' : ''}`
                    }
                    className={`h-7 rounded text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      r.occupied
                        ? 'bg-surface-2 text-content-faint cursor-not-allowed opacity-50'
                        : r.coreNumber === suggested
                          ? 'bg-info-bg text-primary ring-1 ring-primary hover:bg-info-bg'
                          : 'bg-surface border border-line text-content-muted hover:bg-surface-2 hover:border-primary'
                    }`}
                  >
                    {r.coreNumber}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 && slotId && (
            <p className="text-xs text-content-faint text-center py-4">
              이 경로에 코어가 없습니다 — OPGW 용량 설정 확인
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line shrink-0 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-content-muted hover:bg-surface-2 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
