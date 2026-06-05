import { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '../../../stores/authStore';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useToastStore } from '../stores/toastStore';
import { calculateCenterOnBounds, calculateCenterOnEquipment } from '../hooks/useViewport';
import { useRackModuleCategories } from '../../rack/hooks/useRackModuleCategories';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useInteractionStore } from '../stores/interactionStore';
import { generateTempId } from '../../../utils/idHelpers';
import { Toolbar } from './Toolbar';
import { EditorSidebar } from './EditorSidebar';
import { CanvasView } from './CanvasView';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { CablePathOverlay } from './CablePathOverlay';
import { NetworkTopologyModal } from '../../network/NetworkTopologyModal';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { EquipmentResizeHandlesHost } from './EquipmentResizeHandlesHost';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { FloorSettingsPanel } from './FloorSettingsPanel';
import { DwgImportModal } from './DwgImportModal';
import { BackgroundLayersPanel } from './BackgroundLayersPanel';
import { CableSpecModalWrapper } from './modals/CableSpecModal';
import { EquipmentMaterialModal } from './modals/EquipmentMaterialModal';
import { EquipmentPasteModal } from './modals/EquipmentPasteModal';
import { DraftRecoveryDialog } from './modals/DraftRecoveryDialog';
import { ToastHost } from './ToastHost';
import { CableEndpointPickerHost } from './CableEndpointPickerHost';
import { RackModuleDialog } from '../../rack/components/RackModuleDialog';
import { EditorHintBar } from './EditorHintBar';
import { ConflictDialog } from '../../workingCopy/ConflictDialog';

// CM-B: scaleRatio 폐기 — CablePathOverlay 가 더 이상 인자가 필요 없다.
// (직접 import 해서 쓰지만 명명 일관성을 위해 wrapper 유지)
function CablePathOverlayWrapper({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return <CablePathOverlay canvasRef={canvasRef} />;
}


interface FloorPlanEditorProps {
  floorId: string;
}

export function FloorPlanEditor({ floorId }: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const draftCheckedRef = useRef(false);

  const {
    floor, floorPlan, floorLoading, planLoading, planError, saveError, clearSaveError, saveMutation, handleSave,
  } = useFloorPlanData(floorId, containerRef);

  useEditorKeyboard(handleSave, containerRef, floorPlan);

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
    const newEquipmentList = [...es.localEquipment, newEquipment];
    es.setLocalEquipment(newEquipmentList);
    cs.setPasteEquipmentModalOpen(false);
    cs.setPasteEquipmentName('');
    es.setHasChanges(true);
    es.setSelectedIds([newEquipment.id]);
    es.setClipboard({ type: 'equipment', data: newEquipment });
  }, []);

  const resetEditor = useEditorStore(s => s.resetEditor);
  const detailPanelEquipmentId = useEditorStore(s => s.detailPanelEquipmentId);
  const snapshotActive = useSnapshotStore(s => s.active);
  const snapshotLabel = useSnapshotStore(s => s.label);
  const restoredFromVersion = useEditorStore(s => s.restoredFromVersion);
  const floorConflict = useEditorStore(s => s.floorConflict);
  const setRestoredFromVersion = useEditorStore(s => s.setRestoredFromVersion);
  const setLocalEquipment = useEditorStore(s => s.setLocalEquipment);
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
  const handledQueryRef = useRef(false);
  useEffect(() => {
    if (handledQueryRef.current) return;
    const targetId = searchParams.get('equipmentId');
    if (!targetId) return;
    const eq = useEditorStore.getState().localEquipment.find((e) => e.id === targetId);
    if (!eq) return; // 도면 데이터 아직 로드 전 — 다음 render 에 재시도.
    handledQueryRef.current = true;
    const es = useEditorStore.getState();
    es.setSelectedIds([targetId]);
    es.setDetailPanelEquipmentId(targetId);
    es.bumpFocusTick();
    // URL 정리.
    const next = new URLSearchParams(searchParams);
    next.delete('equipmentId');
    setSearchParams(next, { replace: true });
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
    const eq = useEditorStore
      .getState()
      .localEquipment.find((e) => e.id === detailPanelEquipmentId);
    if (!eq || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fit = calculateCenterOnEquipment(eq, rect.width, rect.height, RIGHT_PANEL_WIDTH);
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
    const cables = useEditorStore.getState().localCables;
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

  // Check for localStorage draft on initial load
  useEffect(() => {
    if (draftCheckedRef.current || !floorPlan) return;
    draftCheckedRef.current = true;
    const draftKey = `draft-plan-${floorId}`;
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (draft && draft.savedAt) {
          setShowDraftDialog(true);
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }
  }, [floorId, floorPlan]);

  const handleRestoreDraft = useCallback(() => {
    const draftKey = `draft-plan-${floorId}`;
    const raw = localStorage.getItem(draftKey);
    if (!raw) { setShowDraftDialog(false); return; }
    try {
      const draft = JSON.parse(raw);
      const store = useEditorStore.getState();
      if (draft.localEquipment) store.setLocalEquipment(draft.localEquipment);
      if (draft.localCables) store.setCables(draft.localCables);
      if (draft.localRackModules) store.setRackModules(draft.localRackModules);
      if (draft.pendingLogs) {
        for (const log of draft.pendingLogs) store.addPendingLog(log);
      }
      if (draft.pendingFiberPaths) {
        // Drafts 은 canonical shape — legacy nested shape (이전 brief 시기) 도 흡수.
        for (const fp of draft.pendingFiberPaths) {
          const ofdAId = fp.ofdAId ?? fp.ofdA?.id;
          const ofdBId = fp.ofdBId ?? fp.ofdB?.id;
          if (!ofdAId || !ofdBId) continue;
          store.addPendingFiberPath({
            id: fp.id,
            ofdAId,
            ofdBId,
            portCount: fp.portCount,
            description: fp.description ?? null,
          });
        }
      }
      if (draft.deletedFiberPathIds) {
        for (const id of draft.deletedFiberPathIds) store.deleteFiberPath(id);
      }
      // Restore staged background (3-state). undefined branch is implicit
      // — we just don't call any stage action.
      if (draft.stagedBackgroundDrawing === null) {
        store.stageBackgroundClear();
      } else if (draft.stagedBackgroundDrawing) {
        store.stageBackgroundDrawing(draft.stagedBackgroundDrawing);
      }
      if (typeof draft.stagedBackgroundOpacity === 'number') {
        store.stageBackgroundOpacity(draft.stagedBackgroundOpacity);
      }
      if (draft.metadata) {
        if (draft.metadata.gridSize) store.setGridSize(draft.metadata.gridSize);
        if (draft.metadata.majorGridSize) store.setMajorGridSize(draft.metadata.majorGridSize);
        // CM-B: scaleRatio 폐기 — draft.metadata.scaleRatio 가 있어도 무시.
      }
      store.setHasChanges(true);
    } catch { /* ignore */ }
    setShowDraftDialog(false);
  }, [floorId]);

  const handleDiscardDraft = useCallback(() => {
    localStorage.removeItem(`draft-plan-${floorId}`);
    // Reset local state to server data
    useEditorStore.getState().clearPendingData();
    useEditorStore.getState().setHasChanges(false);
    // Option C: discarding a draft also clears the persisted viewport so the
    // canvas re-fits to the (possibly different) server-side drawing on the
    // next viewport-init pass. Without this, users land at a zoom/pan that
    // was fitted to the now-discarded staged DWG.
    const viewportKey = `floorplan-viewport-${floorId}-v2`;
    localStorage.removeItem(viewportKey);
    setShowDraftDialog(false);
  }, [floorId]);

  // Debounced auto-backup to localStorage. Includes staged DWG so a
  // refresh after upload survives. localStorage cap is ~5MB/origin —
  // large DWGs may blow the quota; we fall back to saving everything
  // *except* the DWG so equipment/cables/etc. still recover cleanly.
  useEffect(() => {
    const timer = setInterval(() => {
      const state = useEditorStore.getState();
      if (!state.hasChanges) return;
      const draftKey = `draft-plan-${floorId}`;
      const draft = {
        localEquipment: state.localEquipment,
        localCables: state.localCables,
        localRackModules: state.localRackModules,
        pendingLogs: state.pendingLogs,
        pendingFiberPaths: state.pendingFiberPaths,
        deletedFiberPathIds: state.deletedFiberPathIds,
        stagedBackgroundDrawing: state.stagedBackgroundDrawing,
        stagedBackgroundOpacity: state.stagedBackgroundOpacity,
        metadata: {
          gridSize: state.gridSize,
          majorGridSize: state.majorGridSize,
        },
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch (err) {
        if (
          err instanceof DOMException &&
          err.name === 'QuotaExceededError' &&
          draft.stagedBackgroundDrawing
        ) {
          // Drop the heavy field, retry. If the slim version also fails,
          // we just give up this tick — next tick will retry.
          const slim = { ...draft, stagedBackgroundDrawing: undefined };
          try {
            localStorage.setItem(draftKey, JSON.stringify(slim));
            // eslint-disable-next-line no-console
            console.warn(
              '[draft] localStorage quota exceeded — DWG dropped from draft. ' +
                'On refresh, equipment/cables will recover but the DWG will need to be re-imported.',
            );
          } catch { /* both attempts failed */ }
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [floorId]);

  // Navigation guard: warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const setHasChanges = useEditorStore(s => s.setHasChanges);
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

    const newList = [...useEditorStore.getState().localEquipment, baseEquip];
    setLocalEquipment(newList);

    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
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
    const existingNames = new Set(cs.localEquipment.map((eq) => eq.name));
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

    const newEquipmentList = [...cs.localEquipment, rackEquip];
    setLocalEquipment(newEquipmentList);

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

    if (newModules.length > 0) {
      const merged = [...cs.localRackModules, ...newModules];
      cs.setRackModules(merged);
    }

    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
    cs.setSelectedIds([rackId]);
    useToastStore.getState().showToast('랙을 배치했습니다');
  }, [rackModuleCategories, setLocalEquipment, setTool]);


  const isPlanNotFound = planError && (planError as { response?: { status: number } }).response?.status === 404;
  const isLoading = floorLoading || planLoading;

  if (isLoading && !isPlanNotFound) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-gray-100 overflow-hidden">
      {saveError && (
        <div className="bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center justify-between">
          <span>저장 실패: {saveError}</span>
          <button onClick={clearSaveError} className="ml-4 text-white/80 hover:text-white text-xs">
            닫기
          </button>
        </div>
      )}
      <Toolbar
        floor={floor}
        floorPlan={floorPlan}
        isAdmin={isAdmin}
        handleSave={handleSave}
        isSaving={saveMutation.isPending}
        onToggleHistory={() => setShowHistory(p => !p)}
        onToggleSettings={() => setShowSettings(p => !p)}
        onToggleLayers={() => setShowLayers(p => !p)}
      />

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
            {!snapshotActive && <EditorSidebar />}
            <div className="flex-1 flex flex-col min-w-0 relative">
              <CanvasView
                canvasRef={canvasRef}
                containerRef={containerRef}
                floorPlan={floorPlan}
                floorId={floorId}
                onPlacePreset={handlePlacePreset}
                onImportClick={() => setShowImportModal(true)}
              >
                <ConnectionOverlay canvasRef={canvasRef} />
                <CablePathOverlayWrapper canvasRef={canvasRef} />
                <EquipmentResizeHandlesHost />
                <EditorHintBar />
              </CanvasView>

              <NetworkTopologyModal />

              {detailPanelEquipmentId && (
                <EquipmentDetailPanel equipmentId={detailPanelEquipmentId} />
              )}


              {showHistory && (
                <ChangeHistoryPanel floorId={floorId} onClose={() => setShowHistory(false)} />
              )}

              {showSettings && !snapshotActive && (
                <FloorSettingsPanel
                  floorId={floorId}
                  floorPlan={floorPlan}
                  onClose={() => setShowSettings(false)}
                  onImportClick={() => setShowImportModal(true)}
                />
              )}

              {showLayers && effectiveBackgroundDrawing && (
                <BackgroundLayersPanel
                  bg={effectiveBackgroundDrawing}
                  onClose={() => setShowLayers(false)}
                />
              )}

              {/* Preview mode banner (top of canvas area) */}
              {snapshotActive && !showHistory && (
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
            </div>
          </>
        )}
      </div>

      <EquipmentMaterialModal onAdd={handleAddEquipment} />
      <CableEndpointPickerHost />
      <RackModuleDialog />
      <CableSpecModalWrapper />
      {showImportModal && floorId && (
        <DwgImportModal
          floorId={floorId}
          onClose={() => setShowImportModal(false)}
          onImported={() => { /* invalidation handled inside modal */ }}
        />
      )}
      {showDraftDialog && (
        <DraftRecoveryDialog onRestore={handleRestoreDraft} onDiscard={handleDiscardDraft} />
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
