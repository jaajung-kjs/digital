import { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '../../../stores/authStore';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useEditorStore, type LocalCable } from '../stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { getUnifiedDirtyCount } from '../../workingCopy/hooks';
import { useKindToAssetTypeId } from '../../assets/useKindToAssetTypeId';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useToastStore } from '../stores/toastStore';
import { calculateCenterOnBounds } from '../hooks/useViewport';
import { floorTargetFor } from '../../workingCopy/floorAnchor';
import { useRackModuleCategories } from '../../rack/hooks/useRackModuleCategories';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useInteractionStore } from '../stores/interactionStore';
import { generateTempId } from '../../../utils/idHelpers';
import { Toolbar } from './Toolbar';
import { EditorInsertBar } from './EditorInsertBar';
import { CanvasView } from './CanvasView';
import { EditorStatusBar } from './EditorStatusBar';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { CablePathOverlay } from './CablePathOverlay';
import { NetworkTopologyModal } from '../../network/NetworkTopologyModal';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { EquipmentResizeHandlesHost } from './EquipmentResizeHandlesHost';
import { ReportPanel } from '../../report/ReportPanel';
import { WorkOrderHistoryPanel } from '../../report/WorkOrderHistoryPanel';
import { DwgImportModal } from './DwgImportModal';
import { BackgroundLayersPanel } from './BackgroundLayersPanel';
import { CableSpecModalWrapper } from './modals/CableSpecModal';
import { EquipmentMaterialModal } from './modals/EquipmentMaterialModal';
import { EquipmentPasteModal } from './modals/EquipmentPasteModal';
import { ToastHost } from './ToastHost';
import { CableEndpointPickerHost } from './CableEndpointPickerHost';
import { EditorHintBar } from './EditorHintBar';
import { ConflictDialog } from '../../workingCopy/ConflictDialog';

// CM-B: scaleRatio 폐기. SSOT-2d Task 3: effective 설비 조회용 floorId 만 전달.
function CablePathOverlayWrapper({ canvasRef, floorId }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; floorId: string }) {
  return <CablePathOverlay canvasRef={canvasRef} floorId={floorId} />;
}


interface FloorPlanEditorProps {
  floorId: string;
}

export function FloorPlanEditor({ floorId }: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const [showImportModal, setShowImportModal] = useState(false);

  const {
    floor, floorPlan, floorLoading, planLoading, planError,
  } = useFloorPlanData(floorId, containerRef);

  useEditorKeyboard(containerRef, floorPlan);

  // SSOT-2d Task 4 — 새로 배치한 설비를 통합 stage 로 올릴 때 assetTypeId 해소.
  const kindToAssetTypeId = useKindToAssetTypeId();

  const handlePasteEquipment = useCallback(() => {
    const es = useEditorStore.getState();
    const cs = es;
    if (!es.clipboard || es.clipboard.type !== 'equipment') return;

    const original = es.clipboard.data as FloorPlanEquipment;
    const newEquipment: FloorPlanEquipment = {
      ...original,
      id: generateTempId(),
      name: cs.pasteEquipmentName,
      positionX: original.positionX + 20,
      positionY: original.positionY + 20,
    };
    const assetTypeId = kindToAssetTypeId(newEquipment.kind);
    if (!assetTypeId) {
      // 종류 목록 로딩 중 등 — assetTypeId 미해소면 stage 하지 않는다(데이터 무결성).
      // eslint-disable-next-line no-console
      console.warn(`[paste] assetTypeId 미해소 (kind=${newEquipment.kind}) — 배치 보류`);
      return;
    }
    useSubstationWorkingCopy.getState().stageEquipmentCreate({ ...newEquipment, floorId }, assetTypeId);
    cs.setPasteEquipmentModalOpen(false);
    cs.setPasteEquipmentName('');
    es.setSelectedIds([newEquipment.id]);
    es.setClipboard({ type: 'equipment', data: newEquipment });
  }, [floorId, kindToAssetTypeId]);

  const resetEditor = useEditorStore(s => s.resetEditor);
  const rightPanel = useEditorStore(s => s.rightPanel);
  const detailAssetId = useEditorStore(s => s.detailAssetId);
  const togglePanel = useEditorStore(s => s.togglePanel);
  const closeRightPanel = useEditorStore(s => s.closeRightPanel);
  // 캔버스 focus useEffect / URL deep-link 가 쓰는 "현재 상세 설비 id" alias.
  const detailPanelEquipmentId = useEditorStore(s => s.detailPanelEquipmentId);
  const snapshotActive = useSnapshotStore(s => s.active);
  const snapshotLabel = useSnapshotStore(s => s.label);
  const restoredFromVersion = useEditorStore(s => s.restoredFromVersion);
  const floorConflict = useEditorStore(s => s.floorConflict);
  const setRestoredFromVersion = useEditorStore(s => s.setRestoredFromVersion);
  const setTool = useEditorStore(s => s.setTool);
  const tool = useEditorStore(s => s.tool);
  const { data: rackModuleCategories } = useRackModuleCategories();
  // Reset editor store and snapshot on unmount
  useEffect(() => {
    return () => {
      resetEditor();
      useSnapshotStore.getState().exit();
    };
  }, [resetEditor]);

  // ── URL query 로 들어온 equipmentId 자동 진입 ─────────────────────────────
  // /tree 페이지 통계 패널에서 랙 클릭 시 navigate(`?equipmentId=X`) → 도면 로드
  // 후 해당 설비의 detail panel + viewport focus 를 자동 트리거. 한 번 처리하면
  // URL query 를 비워서 새로고침/뒤로가기 후 재실행 방지.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const targetId = searchParams.get('equipmentId');
    if (!targetId) return;
    // 단일 choke-point 로 "도면에 보이는가" 판정 — 미배치 모듈/회로/포트도 부모
    // 설비 anchor 로 해소되면 통과. anchor 없으면(데이터 미로드/orphan) 다음 render 재시도.
    const target = floorTargetFor(targetId, useSubstationWorkingCopy.getState().effectiveAssets());
    if (!target) return;
    // URL 을 처리 후 비우므로(아래) 매 equipmentId 진입마다 1회 실행된다.
    // 영구 ref 가드를 두지 않아 "도면에서 보기" 반복 시에도 매번 재포커스된다.
    const es = useEditorStore.getState();
    es.setSelectedIds([targetId]);
    es.openDetail(targetId);
    es.bumpFocusTick();
    // URL 정리 — 함수형 업데이터로 최신 params 에서 equipmentId 만 제거 (tab/floor 보존).
    setSearchParams((p) => { p.delete('equipmentId'); return p; }, { replace: true });
  }, [searchParams, setSearchParams, floorPlan]);

  // tool ↔ interaction mode sync — 케이블 도구 선택 시 cableDrawing 진입,
  // 다른 도구로 전환 시 종료.
  useEffect(() => {
    const interaction = useInteractionStore.getState();
    const mode = interaction.mode;

    if (tool === 'cable') {
      if (mode.kind !== 'cableDrawing') interaction.cableActivate();
    } else if (mode.kind === 'cableDrawing') {
      interaction.cancel();
    }
  }, [tool]);

  // 우측 detail panel 폭 (EquipmentDetailPanel.tsx 의 w-[360px] 와 동기화).
  const RIGHT_PANEL_WIDTH = 360;

  // (1) Detail panel 진입 / 같은 설비를 재 더블클릭 시 viewport 정렬.
  //     focusTick 을 deps 에 포함시켜 같은 ID 에서도 재실행되게 함.
  //     ID 변경(다른 설비) + 클릭 반복 둘 다 한 효과로 처리.
  const focusTick = useEditorStore((s) => s.focusTick);
  useEffect(() => {
    if (!detailPanelEquipmentId) return;
    // 단일 choke-point: 선택 asset → 도면 anchor rect. 미배치 모듈/회로/포트는
    // floorTargetFor 가 부모 설비(랙/OFD/분전반) rect 로 해소하므로 그 설비에 포커스.
    const target = floorTargetFor(
      detailPanelEquipmentId,
      useSubstationWorkingCopy.getState().effectiveAssets(),
    );
    if (!target || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fit = calculateCenterOnBounds(
      {
        minX: target.x,
        minY: target.y,
        maxX: target.x + target.width,
        maxY: target.y + target.height,
      },
      rect.width,
      rect.height,
      RIGHT_PANEL_WIDTH,
    );
    useEditorStore.getState().setViewport(fit.zoom, fit.panX, fit.panY);
  }, [detailPanelEquipmentId, focusTick]);

  // (2) 케이블 경로 하이라이트 시 viewport 정렬 — 연결 탭에서 케이블 카드 클릭마다
  //     pathHighlightStore.tracingCableId 가 새 값으로 set 되므로 deps 가 그 ID 와
  //     active 상태. 같은 케이블 카드 두 번 클릭하면 active false→true 전환 또는
  //     tracingCableId 변경으로 재실행.
  const pathHighlightActive = usePathHighlightStore((s) => s.active);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const highlightedEdgeIds = usePathHighlightStore((s) => s.highlightedEdgeIds);
  useEffect(() => {
    if (!pathHighlightActive || highlightedEdgeIds.size === 0) return;
    const cables = useSubstationWorkingCopy.getState().effectiveCables() as unknown as LocalCable[];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cable of cables) {
      if (!highlightedEdgeIds.has(cable.id)) continue;
      const pts = cable.pathPoints;
      if (!pts) continue;
      for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX) || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fit = calculateCenterOnBounds(
      { minX, minY, maxX, maxY },
      rect.width,
      rect.height,
      RIGHT_PANEL_WIDTH,
      // 케이블 경로는 endpoint 가 이미 설비 중심이라 padding 조금만 줘도 양 끝 설비가 보임.
      200,
      100,
    );
    useEditorStore.getState().setViewport(fit.zoom, fit.panX, fit.panY);
  }, [pathHighlightActive, tracingCableId, highlightedEdgeIds]);

  // Navigation guard: warn on unsaved changes (통합 dirty 신호 기준).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (getUnifiedDirtyCount() > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const stagedBackgroundDrawing = useEditorStore(s => s.stagedBackgroundDrawing);
  // Effective drawing — staged value (if user staged one this session)
  // ?? server. Used by the layers panel so a freshly-imported but
  // not-yet-saved DWG still drives the layer toggles.
  const effectiveBackgroundDrawing =
    stagedBackgroundDrawing !== undefined ? stagedBackgroundDrawing : floorPlan?.backgroundDrawing ?? null;

  /**
   * P9: name-modal commit handler for the kind-based flow. Invoked from
   * EquipmentMaterialModal after the user finishes drag-to-draw and types a
   * name. Always uses `newEquipmentKind` — preset placement uses
   * `handlePlacePreset` instead and does not open this modal.
   */
  const handleAddEquipment = () => {
    const cs = useEditorStore.getState();
    const drawnWidth = cs.equipmentDrawnSize?.width ?? 60;
    const drawnHeight = cs.equipmentDrawnSize?.height ?? 100;
    // RACK kind via the standalone "랙" sidebar entry creates an empty 42U
    // rack on the canvas; the rack-preset path doesn't go through this modal.
    const kind = cs.newEquipmentKind ?? 'OFD';

    const baseEquip: FloorPlanEquipment = {
      id: generateTempId(),
      kind,
      name: cs.newEquipmentName,
      positionX: cs.newEquipmentPosition.x,
      positionY: cs.newEquipmentPosition.y,
      width: drawnWidth,
      height: drawnHeight,
      rotation: 0,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
      properties: null,
      // Plain rack via the "랙" kind leaf → empty 42U; preset path doesn't go through this modal.
      totalU: kind === 'RACK' ? 42 : null,
    };

    const assetTypeId = kindToAssetTypeId(kind);
    if (!assetTypeId) {
      // eslint-disable-next-line no-console
      console.warn(`[add-equipment] assetTypeId 미해소 (kind=${kind}) — 배치 보류`);
      useToastStore.getState().showToast('설비 종류를 확인할 수 없어 배치하지 못했습니다');
      return;
    }
    useSubstationWorkingCopy.getState().stageEquipmentCreate({ ...baseEquip, floorId }, assetTypeId);

    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentSelection();
    setTool('select');
    cs.setSelectedIds([baseEquip.id]);
    useToastStore.getState().showToast('설비를 배치했습니다');
  };

  /**
   * P9: rack preset placement — single click on canvas. The arming click
   * (sidebar) sets `newEquipmentPreset`; the canvas click (useCanvasEvents)
   * sets `newEquipmentPosition` and calls this. We add the rack equipment
   * + auto-expand the preset modules into RackModule rows on the editor store.
   */
  const handlePlacePreset = useCallback(() => {
    const cs = useEditorStore.getState();
    const preset = cs.newEquipmentPreset;
    if (!preset) return;

    const rackId = generateTempId();
    const baseName = preset.name;
    // Pick a non-conflicting name — append -2/-3/... if there's already a rack with the same name.
    const existingNames = new Set(
      useSubstationWorkingCopy.getState().effectiveEquipment(floorId).map((eq) => eq.name),
    );
    let resolvedName = baseName;
    let suffix = 2;
    while (existingNames.has(resolvedName)) {
      resolvedName = `${baseName}-${suffix++}`;
    }

    const rackEquip: FloorPlanEquipment = {
      id: rackId,
      kind: 'RACK',
      name: resolvedName,
      positionX: cs.newEquipmentPosition.x,
      positionY: cs.newEquipmentPosition.y,
      width: preset.canvasWidth,
      height: preset.canvasHeight,
      rotation: 0,
      totalU: preset.totalU,
      description: null,
      manager: null,
      frontImageUrl: null,
      rearImageUrl: null,
      // 사이드바에서 프리셋으로 배치하면 그 프리셋을 source 로 기록 →
      // 나중에 detail panel 열었을 때 드롭다운에 자동으로 그 프리셋이 선택됨.
      properties: { sourcePresetId: preset.id },
    };

    const rackAssetTypeId = kindToAssetTypeId('RACK');
    if (!rackAssetTypeId) {
      // eslint-disable-next-line no-console
      console.warn('[place-preset] RACK assetTypeId 미해소 — 배치 보류');
      useToastStore.getState().showToast('랙 종류를 확인할 수 없어 배치하지 못했습니다');
      return;
    }
    const wc = useSubstationWorkingCopy.getState();
    wc.stageEquipmentCreate({ ...rackEquip, floorId }, rackAssetTypeId);

    // Resolve module categories by code; skip silently if a preset references
    // an unknown code (data drift). Emit one console warning per occurrence.
    const codeToCategory = new Map<string, RackModuleCategory>(
      (rackModuleCategories ?? []).map((c) => [c.code, c]),
    );
    const newModules: RackModule[] = [];
    preset.modules.forEach((mod, idx) => {
      const cat = codeToCategory.get(mod.categoryCode);
      if (!cat) {
        // eslint-disable-next-line no-console
        console.warn(
          `[rack-preset] module category code '${mod.categoryCode}' not in rack-module-categories — skipped`,
        );
        return;
      }
      newModules.push({
        id: generateTempId(),
        rackEquipmentId: rackId,
        categoryId: cat.id,
        categoryCode: cat.code,
        categoryName: cat.name,
        categoryDisplayColor: cat.displayColor,
        categoryDefaultSlotSpan: cat.defaultSlotSpan,
        name: mod.defaultName ?? cat.name,
        slotIndex: mod.slotIndex,
        slotSpan: mod.slotSpan,
        installDate: null,
        manager: null,
        description: null,
        properties: null,
        sortOrder: idx,
        createdAt: '',
        updatedAt: '',
      });
    });

    for (const m of newModules) wc.stageRackModuleCreate(m);

    cs.resetNewEquipmentSelection();
    setTool('select');
    cs.setSelectedIds([rackId]);
    useToastStore.getState().showToast('랙을 배치했습니다');
  }, [rackModuleCategories, floorId, kindToAssetTypeId, setTool]);


  const isPlanNotFound = planError && (planError as { response?: { status: number } }).response?.status === 404;
  const isLoading = floorLoading || planLoading;

  if (isLoading && !isPlanNotFound) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-100 overflow-hidden">
      <Toolbar
        floor={floor}
        floorPlan={floorPlan}
        isAdmin={isAdmin}
        activeRightPanel={rightPanel}
        onToggleWorkOrders={() => togglePanel('history')}
        onToggleReport={() => togglePanel('report')}
        onToggleLayers={() => togglePanel('background')}
        onImportClick={() => setShowImportModal(true)}
      />

      {!snapshotActive && <EditorInsertBar />}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {isPlanNotFound ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">평면도를 찾을 수 없습니다</h3>
              <p className="mt-2 text-gray-500">이 실의 평면도 데이터가 없습니다.</p>
              <Link to="/" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                트리로 돌아가기
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col min-w-0 relative">
              <CanvasView
                canvasRef={canvasRef}
                containerRef={containerRef}
                floorPlan={floorPlan}
                floorId={floorId}
                onPlacePreset={handlePlacePreset}
                onImportClick={() => setShowImportModal(true)}
              >
                <ConnectionOverlay canvasRef={canvasRef} floorId={floorId} />
                <CablePathOverlayWrapper canvasRef={canvasRef} floorId={floorId} />
                <EquipmentResizeHandlesHost />
                <EditorHintBar />
              </CanvasView>

              <NetworkTopologyModal />

              {/* 우측 패널 — 단일 enum 으로 동시에 최대 하나만 렌더(상호배타).
                  detail/report/history/background 가 같은 우측 슬롯을 공유하므로
                  더 이상 겹치지 않는다. (그리드/투명도는 하단 상태바, 배경 교체/제거는 'background' 패널.) */}
              {rightPanel === 'detail' && detailAssetId && (
                <EquipmentDetailPanel equipmentId={detailAssetId} floorId={floorId} />
              )}

              {rightPanel === 'history' && (
                <WorkOrderHistoryPanel floorId={floorId} onClose={() => closeRightPanel()} />
              )}

              {rightPanel === 'report' && !snapshotActive && (
                <ReportPanel floorId={floorId} onClose={() => closeRightPanel()} />
              )}

              {rightPanel === 'background' && effectiveBackgroundDrawing && (
                <BackgroundLayersPanel
                  bg={effectiveBackgroundDrawing}
                  floorPlan={floorPlan}
                  canEdit={!snapshotActive}
                  onClose={() => closeRightPanel()}
                />
              )}

              {/* Preview mode banner (top of canvas area) */}
              {snapshotActive && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg shadow-sm">
                  <span className="text-xs font-medium text-amber-800">과거 도면 보기 — {snapshotLabel}</span>
                </div>
              )}

              {/* Restore banner — shown after restoring from a past version until save */}
              {restoredFromVersion && !snapshotActive && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-300 rounded-lg shadow-sm">
                  <span className="text-xs font-medium text-blue-800">
                    {restoredFromVersion} 버전에서 복원됨 — 저장하지 않으면 반영되지 않습니다
                  </span>
                  <button
                    onClick={() => setRestoredFromVersion(null)}
                    className="text-blue-400 hover:text-blue-600 text-xs"
                    title="닫기"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* 하단 상태바 — 그리드·스냅·줄자·투명도·줌 단일 홈 (Excel/PPT식).
                  캔버스 컬럼 맨 아래(전체 폭). 우측 패널은 absolute 오버레이라
                  이 바는 캔버스 영역 폭을 그대로 차지한다. */}
              {!snapshotActive && (
                <EditorStatusBar floorPlan={floorPlan} containerRef={containerRef} />
              )}
            </div>
          </>
        )}
      </div>

      <EquipmentMaterialModal onAdd={handleAddEquipment} />
      <CableEndpointPickerHost floorId={floorId} />
      <CableSpecModalWrapper />
      {showImportModal && floorId && (
        <DwgImportModal
          floorId={floorId}
          onClose={() => setShowImportModal(false)}
          onImported={() => { /* invalidation handled inside modal */ }}
        />
      )}
      <EquipmentPasteModal onPaste={handlePasteEquipment} />
      {floorConflict && (
        <ConflictDialog
          conflicts={floorConflict}
          message="다른 사용자가 이 도면을 먼저 변경했습니다. 최신을 불러오면 저장하지 않은 현재 편집을 잃습니다."
          onClose={() => useEditorStore.getState().setFloorConflict(null)}
          onReloadLatest={async () => {
            await queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
            useEditorStore.getState().setFloorConflict(null);
          }}
        />
      )}
      <ToastHost />
    </div>
  );
}
