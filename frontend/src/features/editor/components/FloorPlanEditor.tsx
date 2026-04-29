import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIsAdmin } from '../../../stores/authStore';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { MaterialCategory } from '../../../types/material';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { generateTempId } from '../../../utils/idHelpers';
import { useRecentMaterialsStore } from '../../materials/stores/recentMaterialsStore';
import { useMaterialCategories } from '../../materials/hooks/useMaterialCategories';
import { Toolbar } from './Toolbar';
import { EditorSidebar } from './EditorSidebar';
import { CanvasView } from './CanvasView';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { CablePathOverlay } from './CablePathOverlay';
import { TopologyModal } from '../../pathTrace/components/TopologyModal';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { FloorSettingsPanel } from './FloorSettingsPanel';
import { CableSpecModalWrapper } from './modals/CableSpecModal';
import { EquipmentMaterialModal } from './modals/EquipmentMaterialModal';
import { EquipmentPasteModal } from './modals/EquipmentPasteModal';
import { DraftRecoveryDialog } from './modals/DraftRecoveryDialog';

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
  const addRecent = useRecentMaterialsStore(s => s.addRecent);
  const { data: equipmentCats } = useMaterialCategories('EQUIPMENT');
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

  const handleAddEquipment = () => {
    const cs = useEditorStore.getState();
    const drawnWidth = cs.equipmentDrawnSize?.width ?? 60;
    const drawnHeight = cs.equipmentDrawnSize?.height ?? 100;

    // Locate the active category in the equipment tree (root + children).
    // by-type returns parents only with children embedded — flatten for lookup.
    const flatten = (cats: MaterialCategory[]): MaterialCategory[] =>
      cats.flatMap((c) => [c, ...(c.children ? flatten(c.children) : [])]);
    const allCats: MaterialCategory[] = flatten(equipmentCats ?? []);
    const activeCat = allCats.find((c) => c.id === cs.newEquipmentMaterialCategoryId);
    const preset = activeCat?.rackPreset ?? null;
    const isRackPreset = !!preset;

    // P8: kind defaults to RACK if a rack preset is active, else OFD as a
    // placeholder. P9 will replace this with explicit kind selection in the
    // sidebar / picker.
    const newEquip: FloorPlanEquipment = {
      id: generateTempId(),
      kind: isRackPreset ? 'RACK' : 'OFD',
      name: cs.newEquipmentName,
      positionX: cs.newEquipmentPosition.x,
      positionY: cs.newEquipmentPosition.y,
      width: drawnWidth,
      height: drawnHeight,
      rotation: 0,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
      materialCategoryId: cs.newEquipmentMaterialCategoryId,
      materialCategoryCode: cs.newEquipmentMaterialCategoryCode,
      materialCategoryName: cs.newEquipmentMaterialCategoryName,
      displayColor: cs.newEquipmentDisplayColor,
      specParams: cs.newEquipmentSpecParams,
      specification: cs.newEquipmentSpecification,
      // Phase 4: stamp totalU on parent rack from preset metadata
      totalU: isRackPreset ? preset!.totalU : null,
    };

    let newList: FloorPlanEquipment[] = [...useEditorStore.getState().localEquipment, newEquip];

    // Phase 4: auto-expand rack preset modules into child Equipment.
    // parentEquipmentId points at the parent's tempId; backend bulkUpdatePlan
    // resolves tempId → real id in pass 2 (floor.service.ts:927~999) so this
    // flows through the existing save path unchanged.
    if (isRackPreset && preset!.modules.length > 0) {
      for (const mod of preset!.modules) {
        const childCat = allCats.find((c) => c.code === mod.materialCategoryCode);
        if (!childCat) {
          // eslint-disable-next-line no-console
          console.warn(
            `[rack-preset] module category '${mod.materialCategoryCode}' not found — skipping`,
          );
          continue;
        }
        // P8: rack preset children used to be Equipment rows; in the new
        // model they're RackModule rows on a separate table. The expansion
        // path is broken until P9 wires it into a `localRackModules` slice.
        // We still produce a placeholder Equipment so typecheck holds and the
        // existing save path doesn't crash.
        const child: FloorPlanEquipment = {
          id: generateTempId(),
          kind: 'OFD',
          name: mod.name ?? childCat.name,
          positionX: cs.newEquipmentPosition.x,
          positionY: cs.newEquipmentPosition.y,
          width: Math.max(8, drawnWidth - 8),
          height: 16,
          rotation: 0,
          totalU: null,
          frontImageUrl: null,
          rearImageUrl: null,
          description: null,
          parentEquipmentId: newEquip.id,
          startU: mod.slotU,
          heightU: mod.heightU,
          materialCategoryId: childCat.id,
          materialCategoryCode: childCat.code,
          materialCategoryName: childCat.name,
          displayColor: childCat.displayColor ?? null,
          specParams: {},
          specification: mod.name ?? childCat.name,
        };
        newList = [...newList, child];
      }
    }

    setLocalEquipment(newList);
    pushHistory(newList);

    // Track recent material usage
    if (cs.newEquipmentMaterialCategoryId && cs.newEquipmentMaterialCategoryCode && cs.newEquipmentSpecification) {
      addRecent('equipment', {
        categoryId: cs.newEquipmentMaterialCategoryId,
        categoryCode: cs.newEquipmentMaterialCategoryCode,
        categoryName: cs.newEquipmentSpecification,
        specParams: cs.newEquipmentSpecParams ?? {},
        specification: cs.newEquipmentSpecification,
      });
    }

    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentMaterial();
    setHasChanges(true);
    setTool('select');
  };

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
      <CableSpecModalWrapper />
      {showDraftDialog && (
        <DraftRecoveryDialog onRestore={handleRestoreDraft} onDiscard={handleDiscardDraft} />
      )}
      <EquipmentPasteModal onPaste={handlePasteEquipment} />
    </div>
  );
}
