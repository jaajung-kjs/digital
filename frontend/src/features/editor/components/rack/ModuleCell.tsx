import { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSelection } from '../../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate } from '../../../../types/rackModule';
import { SlotTile } from '../../../../components/SlotTile';
import type { Asset } from '../../../../types/asset';

interface Props {
  module: Asset;
  siblings: Asset[];
  gridRef: React.RefObject<HTMLElement | null>;
}

/**
 * 드래그 인디케이터 grid 좌표 계산.
 * - slotSpan 은 풀 사이즈로 유지. slotIndex 만 valid 범위로 clamp.
 *   → 마지막 슬롯 근처에서 인디케이터가 잘리지 않음.
 * - [1, RACK_SLOT_COUNT+1] 안으로 강제 → implicit row 생성 차단.
 */
function indicatorGridArea(slotIndex: number, slotSpan: number): { start: number; end: number } {
  const safeSpan = Math.max(1, Math.min(slotSpan, RACK_SLOT_COUNT));
  const maxStart = RACK_SLOT_COUNT - safeSpan;
  const clampedIndex = Math.max(0, Math.min(slotIndex, maxStart));
  return { start: clampedIndex + 1, end: clampedIndex + safeSpan + 1 };
}

export function ModuleCell({ module, siblings, gridRef }: Props) {
  // 모듈 클릭 → 다른 모든 자산과 동일한 통합 상세 패널을 연다.
  // (하드코딩 중앙 모달 RackModuleDialog 제거 — 모듈도 Asset 이므로 AssetDetailBody 가 처리.)
  // 공유 선택(SelectionContext)을 우선 사용 → 평면도(브리지로 에디터 패널)·현황(인라인 패널)
  // 양쪽에서 동작. 워크스페이스 밖(공유 선택 없음)에선 에디터 openDetail 폴백.
  const sel = useSelection();
  const openDetail = useEditorStore((s) => s.openDetail);
  const stageAssetUpdate = useSubstationWorkingCopy((s) => s.stageAssetUpdate);

  // 랙모듈 Asset 은 slotIndex/slotSpan 가 항상 채워져 있다(필터 slotIndex != null).
  // 슬롯 기하 계산용 non-null 로컬 + 드래그 훅에 넘길 narrowed shape.
  const slotIndex = module.slotIndex ?? 0;
  const slotSpan = module.slotSpan ?? 1;
  const dragModule = { id: module.id, slotIndex, slotSpan };
  const dragSiblings = siblings.map((s) => ({
    id: s.id,
    slotIndex: s.slotIndex ?? 0,
    slotSpan: s.slotSpan ?? 1,
  }));

  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      stageAssetUpdate(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
  }, [stageAssetUpdate]);

  const onClick = useCallback(() => {
    if (sel) sel.setSelectedAssetId(module.id);
    else openDetail(module.id);
  }, [sel, openDetail, module.id]);

  const { handlePointerDown, dragState } = useSlotDrag({
    module: dragModule,
    siblings: dragSiblings,
    gridRef,
    onClick,
    onCommit,
  });

  // 흰 모듈 룩(차단기·포트 그리드와 통일). 종류는 라벨 + 좌측 카테고리 색 띠로 구분.
  const accent = module.assetType?.displayColor ?? null;
  const dragging = dragState != null;
  const rejected = dragState?.plan.rejected === true;

  // 셀은 어떤 모드든 항상 원래 슬롯에 원래 크기로 dim 표시 (이동 모드와 동일).
  // 후보 위치/크기는 outline 인디케이터로 시각화.
  const cellStart = slotIndex + 1;
  const cellEnd = slotIndex + slotSpan + 1;

  return (
    <>
      {/* 랙·OFD 공용 SlotTile 단일 비주얼. 랙 전용 드래그(onPointerDown)·리사이즈(footer)만 주입.
          슬롯 번호는 좌측 레일에 있으므로 타일 우측 숫자는 두지 않는다. */}
      <SlotTile
        title={module.name}
        accentColor={accent}
        draggable
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        style={{
          gridRowStart: cellStart,
          gridRowEnd: cellEnd,
          gridColumnStart: 1,
          gridColumnEnd: 2,
          opacity: dragging ? 0.35 : 1,
        }}
        ariaLabel={`${module.name}, 슬롯 ${slotIndex + 1}-${slotIndex + slotSpan} (${slotSpan}슬롯) — 클릭하여 편집`}
        tooltip="클릭=편집, 드래그=이동, 하단 핸들=리사이즈"
        footer={
          // 리사이즈 핸들 — 평상시 투명(좌측 색 띠를 가리지 않음), hover 시에만 살짝 강조. 중앙 그립.
          <div
            onPointerDown={(e) => handlePointerDown(e, 'resize')}
            className="absolute inset-x-0 bottom-0 flex h-2.5 items-center justify-center cursor-ns-resize transition-colors hover:bg-surface-2/60"
            title="드래그해서 크기 조절"
            aria-label="크기 조절 핸들"
          >
            <span aria-hidden className="block h-0.5 w-6 rounded-full bg-content-faint" />
          </div>
        }
      />

      {/* 통합 드래그 인디케이터 — 이동/리사이즈 모두 동일 outline.
          - 풀 슬롯스팬 유지, slotIndex 만 clamp → 절대 잘리지 않음
          - pointer-events-none → 아래 셀들 hover/click 통과
          - 거부 시 빨간 outline + animate-pulse (셀 자체는 안 깜빡임 → 깜빡임 버그 해결) */}
      {dragging && dragState && (() => {
        const area = indicatorGridArea(dragState.candidate.slotIndex, dragState.candidate.slotSpan);
        // 상태 색만 색을 쓴다(ISA-101): 거부=danger, 정상 이동=primary outline.
        const borderColor = rejected ? 'var(--danger)' : 'var(--primary)';
        return (
          <div
            aria-hidden
            className={`pointer-events-none rounded-md ${rejected ? 'animate-pulse' : ''}`}
            style={{
              gridRowStart: area.start,
              gridRowEnd: area.end,
              gridColumnStart: 1,
              gridColumnEnd: 2,
              boxShadow: `inset 0 0 0 2.5px ${borderColor}`,
              backgroundColor: 'transparent',
              zIndex: 10,
            }}
          />
        );
      })()}
    </>
  );
}
