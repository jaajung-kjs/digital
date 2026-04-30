import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIsAdmin } from '../../../stores/authStore';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { useRackModuleCategories } from '../../rack/hooks/useRackModuleCategories';
import { generateTempId } from '../../../utils/idHelpers';
import { Toolbar } from './Toolbar';
import { EditorSidebar } from './EditorSidebar';
import { CanvasView } from './CanvasView';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { CablePathOverlay } from './CablePathOverlay';
import { TopologyModal } from '../../pathTrace/components/TopologyModal';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { FloorSettingsPanel } from './FloorSettingsPanel';
import { BackgroundLayersPanel } from './BackgroundLayersPanel';
import { CableSpecModalWrapper } from './modals/CableSpecModal';
import { EquipmentMaterialModal } from './modals/EquipmentMaterialModal';
import { EquipmentPasteModal } from './modals/EquipmentPasteModal';
import { DraftRecoveryDialog } from './modals/DraftRecoveryDialog';
import { CableEndpointPickerHost } from './CableEndpointPickerHost';
import { RackModuleDialog } from '../../rack/components/RackModuleDialog';

function CablePathOverlayWrapper({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  return <CablePathOverlay canvasRef={canvasRef} scaleRatio={scaleRatio} />;
}

function ToolStatusBar() {
  const tool = useEditorStore(s => s.tool);
  const isDrawingEquipment = useEditorStore(s => s.isDrawingEquipment);

  const getMessage = (): string | null => {
    switch (tool) {
      case 'cable':
        // Cable status bar is handled by CablePathOverlay to avoid duplication
        return null;
      case 'equipment':
        return isDrawingEquipment ? '끝점을 클릭하여 크기를 결정하세요' : '설비 시작점을 클릭하세요';
      default:
        return null;
    }
  };

  const message = getMessage();
  if (!message) return null;

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
      style={{ zIndex: 15 }}
    >
      <span className="text-sm text-blue-600">{message}</span>
    </div>
  );
}

interface FloorPlanEditorProps {
  floorId: string;
}

export function FloorPlanEditor({ floorId }: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAdmin = useIsAdmin();
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const draftCheckedRef = useRef(false);

  const {
    floor, floorPlan, floorLoading, planLoading, planError, saveError, clearSaveError, saveMutation, handleSave,
  } = useFloorPlanData(floorId, containerRef);

  useEditorKeyboard(handleSave, floorId, containerRef);
  const { pushHistory } = useEditorHistory();

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
    pushHistory(newEquipmentList);
    cs.setPasteEquipmentModalOpen(false);
    cs.setPasteEquipmentName('');
    es.setHasChanges(true);
    es.setSelectedEquipment(newEquipment);
    es.setSelectedIds([newEquipment.id]);
    es.setClipboard({ type: 'equipment', data: newEquipment });
  }, [pushHistory]);

  const resetEditor = useEditorStore(s => s.resetEditor);
  const detailPanelEquipmentId = useEditorStore(s => s.detailPanelEquipmentId);
  const snapshotActive = useSnapshotStore(s => s.active);
  const snapshotLabel = useSnapshotStore(s => s.label);
  const restoredFromVersion = useEditorStore(s => s.restoredFromVersion);
  const setRestoredFromVersion = useEditorStore(s => s.setRestoredFromVersion);
  const setLocalEquipment = useEditorStore(s => s.setLocalEquipment);
  const setTool = useEditorStore(s => s.setTool);
  const { data: rackModuleCategories } = useRackModuleCategories();
  // Reset editor store and snapshot on unmount
  useEffect(() => {
    return () => {
      resetEditor();
      useSnapshotStore.getState().exit();
    };
  }, [resetEditor]);

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
      if (draft.localEquipment) useEditorStore.getState().setLocalEquipment(draft.localEquipment);
      if (draft.localCables) useEditorStore.getState().setCables(draft.localCables);
      if (draft.pendingLogs) {
        for (const log of draft.pendingLogs) {
          useEditorStore.getState().addPendingLog(log);
        }
      }
      if (draft.pendingFiberPaths) {
        for (const fp of draft.pendingFiberPaths) {
          useEditorStore.getState().addPendingFiberPath(fp);
        }
      }
      if (draft.deletedFiberPathIds) {
        for (const id of draft.deletedFiberPathIds) {
          useEditorStore.getState().deleteFiberPath(id);
        }
      }
      if (draft.metadata) {
        if (draft.metadata.gridSize) useEditorStore.getState().setGridSize(draft.metadata.gridSize);
        if (draft.metadata.majorGridSize) useEditorStore.getState().setMajorGridSize(draft.metadata.majorGridSize);
        if (draft.metadata.scaleRatio !== undefined) useEditorStore.getState().setScaleRatio(draft.metadata.scaleRatio);
      }
      useEditorStore.getState().setHasChanges(true);
    } catch { /* ignore */ }
    setShowDraftDialog(false);
  }, [floorId]);

  const handleDiscardDraft = useCallback(() => {
    localStorage.removeItem(`draft-plan-${floorId}`);
    // Reset local state to server data
    useEditorStore.getState().clearPendingData();
    useEditorStore.getState().setHasChanges(false);
    setShowDraftDialog(false);
  }, [floorId]);

  // Debounced auto-backup to localStorage
  useEffect(() => {
    const timer = setInterval(() => {
      const state = useEditorStore.getState();
      if (!state.hasChanges) return;
      const draftKey = `draft-plan-${floorId}`;
      try {
        const draft = {
          localEquipment: state.localEquipment,
          localCables: state.localCables,
          pendingLogs: state.pendingLogs,
          pendingFiberPaths: state.pendingFiberPaths,
          deletedFiberPathIds: state.deletedFiberPathIds,
          metadata: {
            gridSize: state.gridSize,
            majorGridSize: state.majorGridSize,
            scaleRatio: state.scaleRatio,
          },
          savedAt: Date.now(),
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch { /* quota exceeded or serialization error */ }
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
    pushHistory(newList);

    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
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
      properties: null,
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
        name: mod.defaultName ?? cat.name,
        startU: mod.slotU,
        heightU: mod.heightU,
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

    pushHistory(newEquipmentList);
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
  }, [pushHistory, rackModuleCategories, setLocalEquipment, setTool]);


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
              >
                <ConnectionOverlay floorId={floorId} canvasRef={canvasRef} />
                <CablePathOverlayWrapper canvasRef={canvasRef} />
                <ToolStatusBar />
              </CanvasView>

              <TopologyModal />

              {detailPanelEquipmentId && (
                <EquipmentDetailPanel equipmentId={detailPanelEquipmentId} floorId={floorId} />
              )}


              {showHistory && (
                <ChangeHistoryPanel floorId={floorId} onClose={() => setShowHistory(false)} />
              )}

              {showSettings && !snapshotActive && (
                <FloorSettingsPanel floorId={floorId} floorPlan={floorPlan} onClose={() => setShowSettings(false)} />
              )}

              {showLayers && floorPlan?.backgroundDrawing && (
                <BackgroundLayersPanel
                  bg={floorPlan.backgroundDrawing}
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
      {showDraftDialog && (
        <DraftRecoveryDialog onRestore={handleRestoreDraft} onDiscard={handleDiscardDraft} />
      )}
      <EquipmentPasteModal onPaste={handlePasteEquipment} />
    </div>
  );
}
