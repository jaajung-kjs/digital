import { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSelection } from '../../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate } from '../../../../types/rackModule';
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

  // ISA-101: 랙 모듈은 무채색 다크 페이스플레이트(실제 장비 faceplate 느낌). 종류는
  // 라벨로 구분, 색은 상태/알람 전용. categoryDisplayColor(DB 보라/네온)는 신뢰 안 함.
  const FACEPLATE_BG = 'var(--eq-1)'; // #44403c — 다크 무채색 바디
  const FACEPLATE_FG = 'var(--eq-4)'; // #d6d3d1 — 밝은 라벨
  const dragging = dragState != null;
  const rejected = dragState?.plan.rejected === true;

  // 셀은 어떤 모드든 항상 원래 슬롯에 원래 크기로 dim 표시 (이동 모드와 동일).
  // 후보 위치/크기는 outline 인디케이터로 시각화.
  const cellStart = slotIndex + 1;
  const cellEnd = slotIndex + slotSpan + 1;
  const slotLabel =
    slotSpan > 1
      ? `${slotIndex + 1}–${slotIndex + slotSpan}`
      : `${slotIndex + 1}`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        style={{
          gridRowStart: cellStart,
          gridRowEnd: cellEnd,
          gridColumnStart: 1,
          gridColumnEnd: 2,
          background: FACEPLATE_BG,
          color: FACEPLATE_FG,
          // 페이스플레이트 베젤 — 상단 하이라이트 + 하단 음영(절제된 입체감).
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.28)',
          opacity: dragging ? 0.35 : 1,
        }}
        className="relative flex items-center gap-1.5 px-2.5 text-[11px] font-medium rounded-[5px] border border-black/40 select-none cursor-grab hover:brightness-110 transition-[filter,opacity] overflow-hidden min-h-0"
        aria-label={`${module.name}, 슬롯 ${slotIndex + 1}-${slotIndex + slotSpan} (${slotSpan}슬롯) — 클릭하여 편집`}
        title="클릭=편집, 드래그=이동, 하단 핸들=리사이즈"
      >
        <span className="truncate flex-1 leading-tight">{module.name}</span>
        <span aria-hidden className="shrink-0 font-mono text-[9px] tabular-nums opacity-55">
          {slotLabel}
        </span>
        {/* 리사이즈 핸들 — 절제된 그립(faceplate 톤). */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'resize')}
          className="absolute left-0 right-0 bottom-0 h-2.5 flex items-center justify-center cursor-ns-resize bg-black/20 hover:bg-black/35 transition-colors"
          title="드래그해서 크기 조절"
          aria-label="크기 조절 핸들"
        >
          <span aria-hidden className="block w-6 h-0.5 rounded-full bg-white/40" />
        </div>
      </div>

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
