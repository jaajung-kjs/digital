import { useRef, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { useIsAdmin } from '../../../stores/authStore';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useClipboard } from '../hooks/useClipboard';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { generateTempId } from '../../../utils/idHelpers';
import { MaterialPicker } from '../../materials/components/MaterialPicker';
import { useRecentMaterialsStore } from '../../materials/stores/recentMaterialsStore';
import { getEquipmentCategoryFromMaterial } from '../../../types/material';
import { Toolbar } from './Toolbar';
import { ToolPanel } from './ToolPanel';
import { CanvasView } from './CanvasView';
import { PropertyBar } from './PropertyBar';
import { HeightInput } from './HeightInput';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { CablePathOverlay } from './CablePathOverlay';
import { calculatePathLength } from '../../../utils/cable/pathLength';
import { MaterialSelectionModal } from './MaterialSelectionModal';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';
import { CableMaterialPicker } from '../../materials/components/CableMaterialPicker';
import { getCableTypeFromMaterial } from '../../../types/material';
import { TopologyModal } from '../../pathTrace/components/TopologyModal';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { FloorSettingsPanel } from './FloorSettingsPanel';

const ThreeCanvas = lazy(() => import('../../viewer3d/components/ThreeCanvas').then(m => ({ default: m.ThreeCanvas })));

function CablePathOverlayWrapper({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  return <CablePathOverlay canvasRef={canvasRef} scaleRatio={scaleRatio} />;
}

function CableSpecModalWrapper() {
  const scaleRatio = useEditorStore((s) => s.scaleRatio);
  return <CableSpecModal scaleRatio={scaleRatio} />;
}

function CableSpecModal({ scaleRatio }: { scaleRatio: number | null }) {
  const phase = useCableDrawingStore((s) => s.phase);
  const addCable = useEditorStore((s) => s.addCable);
  const addRecentCable = useRecentMaterialsStore((s) => s.addRecent);
  const [pendingValue, setPendingValue] = useState<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    displayColor: string | null;
    specParams: Record<string, unknown>;
    specification: string;
  } | null>(null);

  // Reset pending value when modal opens
  useEffect(() => {
    if (phase === 'selectingSpec') {
      setPendingValue(null);
    }
  }, [phase]);

  if (phase !== 'selectingSpec') return null;

  const handleConfirm = () => {
    if (!pendingValue) return;
    const { categoryId, categoryCode, categoryName, displayColor, specParams, specification } = pendingValue;
    const store = useCableDrawingStore.getState();
    const pathPoints = store.getPathPoints();
    const cableType = getCableTypeFromMaterial(categoryCode);

    let pathLength = 0;
    let bufferLength = 4;
    let totalLength = 4;
    if (scaleRatio && scaleRatio > 0) {
      const calc = calculatePathLength(pathPoints, scaleRatio);
      pathLength = calc.pathLength;
      bufferLength = calc.bufferLength;
      totalLength = calc.totalLength;
    }

    addCable({
      id: generateTempId(),
      sourceEquipmentId: store.sourceEquipmentId!,
      targetEquipmentId: store.targetEquipmentId!,
      cableType,
      materialCategoryId: categoryId,
      materialCategoryCode: categoryCode,
      materialCategoryName: categoryName,
      displayColor,
      specParams,
      specification,
      pathPoints,
      pathLength,
      bufferLength,
      totalLength,
    });

    addRecentCable('cable', {
      categoryId,
      categoryCode,
      categoryName,
      specParams,
      specification,
    });

    store.complete();
  };

  const handleCancel = () => {
    useCableDrawingStore.getState().cancel();
  };

  return (
    <MaterialSelectionModal
      title="케이블 자재 선택"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!pendingValue}
      selectedLabel={pendingValue?.specification}
    >
      <CableMaterialPicker
        value={pendingValue ? { categoryId: pendingValue.categoryId, specParams: pendingValue.specParams } : null}
        onChange={setPendingValue}
      />
    </MaterialSelectionModal>
  );
}

function InfraMaterialModal({ elementId }: { elementId: string }) {
  const element = useEditorStore.getState().localElements.find((el) => el.id === elementId);
  const elementType = element?.elementType ?? 'conduit';

  // elementType에 따라 표시할 카테고리 필터링
  const titleMap: Record<string, string> = { conduit: '배관 선택', tray: '케이블트레이 선택', pullbox: '풀박스 선택' };
  const parentCodeMap: Record<string, string> = { conduit: 'ACC-PIPE', tray: 'ACC-TRAY', pullbox: 'ACC-BOX' };
  const title = titleMap[elementType] ?? '부속자재 선택';
  const filterParentCode = parentCodeMap[elementType] ?? undefined;

  const [pendingValue, setPendingValue] = useState<{
    categoryId: string;
    specParams: Record<string, unknown>;
    specification: string;
  } | null>(null);

  const handleConfirm = useCallback(() => {
    if (!pendingValue) return;
    const store = useEditorStore.getState();
    const elements = store.localElements.map((el) =>
      el.id === elementId
        ? { ...el, materialCategoryId: pendingValue.categoryId, specParams: pendingValue.specParams }
        : el
    );
    store.setLocalElements(elements);
    store.setHasChanges(true);
    useCanvasStore.getState().setInfraMaterialModalOpen(false);
    useCanvasStore.getState().setInfraMaterialElementId(null);
    store.setTool('select');
  }, [elementId, pendingValue]);

  const handleCancel = useCallback(() => {
    // Cancel: remove the element that was just created
    const store = useEditorStore.getState();
    const elements = store.localElements.filter((el) => el.id !== elementId);
    store.setLocalElements(elements);
    store.setHasChanges(true);
    useCanvasStore.getState().setInfraMaterialModalOpen(false);
    useCanvasStore.getState().setInfraMaterialElementId(null);
    store.setTool('select');
  }, [elementId]);

  return (
    <MaterialSelectionModal
      title={title}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!pendingValue}
      selectedLabel={pendingValue?.specification}
    >
      <MaterialPicker
        categoryType="ACCESSORY"
        filterParentCode={filterParentCode}
        value={pendingValue ? { categoryId: pendingValue.categoryId, specParams: pendingValue.specParams } : null}
        onChange={({ categoryId, specParams: sp, specification }) => {
          setPendingValue({ categoryId, specParams: sp, specification });
        }}
      />
    </MaterialSelectionModal>
  );
}


function ToolStatusBar() {
  const tool = useEditorStore(s => s.tool);
  const isDrawingLine = useCanvasStore(s => s.isDrawingLine);
  const isDrawingEquipment = useCanvasStore(s => s.isDrawingEquipment);

  const getMessage = (): string | null => {
    switch (tool) {
      case 'cable':
        // Cable status bar is handled by CablePathOverlay to avoid duplication
        return null;
      case 'conduit':
        return isDrawingLine ? '끝점을 클릭하세요 (ESC: 취소)' : '배관 시작점을 클릭하세요';
      case 'tray':
        return isDrawingLine ? '끝점을 클릭하세요 (ESC: 취소)' : '트레이 시작점을 클릭하세요';
      case 'pullbox':
        return '풀박스 설치 위치를 클릭하세요';
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
  const { handlePasteEquipment } = useClipboard();
  const { pushHistory } = useEditorHistory();

  const resetEditor = useEditorStore(s => s.resetEditor);
  const detailPanelEquipmentId = useEditorStore(s => s.detailPanelEquipmentId);
  const viewMode = useEditorStore(s => s.viewMode);
  const snapshotActive = useSnapshotStore(s => s.active);
  const snapshotLabel = useSnapshotStore(s => s.label);
  const restoredFromVersion = useEditorStore(s => s.restoredFromVersion);
  const setRestoredFromVersion = useEditorStore(s => s.setRestoredFromVersion);
  const localElements = useEditorStore(s => s.localElements);
  const localEquipment = useEditorStore(s => s.localEquipment);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const setLocalEquipment = useEditorStore(s => s.setLocalEquipment);
  const setTool = useEditorStore(s => s.setTool);
  const equipmentModalOpen = useCanvasStore(s => s.equipmentModalOpen);
  const setEquipmentModalOpen = useCanvasStore(s => s.setEquipmentModalOpen);
  const newEquipmentName = useCanvasStore(s => s.newEquipmentName);
  const setNewEquipmentName = useCanvasStore(s => s.setNewEquipmentName);
  const newEquipmentCategory = useCanvasStore(s => s.newEquipmentCategory);
  const setNewEquipmentCategory = useCanvasStore(s => s.setNewEquipmentCategory);
  const newEquipmentPosition = useCanvasStore(s => s.newEquipmentPosition);
  const newEquipmentMaterialCategoryId = useCanvasStore(s => s.newEquipmentMaterialCategoryId);
  const newEquipmentMaterialCategoryCode = useCanvasStore(s => s.newEquipmentMaterialCategoryCode);
  const newEquipmentMaterialCategoryName = useCanvasStore(s => s.newEquipmentMaterialCategoryName);
  const newEquipmentDisplayColor = useCanvasStore(s => s.newEquipmentDisplayColor);
  const newEquipmentSpecParams = useCanvasStore(s => s.newEquipmentSpecParams);
  const newEquipmentSpecification = useCanvasStore(s => s.newEquipmentSpecification);
  const setNewEquipmentMaterial = useCanvasStore(s => s.setNewEquipmentMaterial);
  const resetNewEquipmentMaterial = useCanvasStore(s => s.resetNewEquipmentMaterial);
  const recentEquipment = useRecentMaterialsStore(s => s.recentEquipment);
  const addRecent = useRecentMaterialsStore(s => s.addRecent);
  const pasteEquipmentModalOpen = useCanvasStore(s => s.pasteEquipmentModalOpen);
  const setPasteEquipmentModalOpen = useCanvasStore(s => s.setPasteEquipmentModalOpen);
  const pasteEquipmentName = useCanvasStore(s => s.pasteEquipmentName);
  const setPasteEquipmentName = useCanvasStore(s => s.setPasteEquipmentName);
  const infraMaterialModalOpen = useCanvasStore(s => s.infraMaterialModalOpen);
  const infraMaterialElementId = useCanvasStore(s => s.infraMaterialElementId);
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
      if (draft.localElements) useEditorStore.getState().setLocalElements(draft.localElements);
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
          localElements: state.localElements,
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

  // Sync selectedElement when localElements changes
  useEffect(() => {
    if (selectedElement) {
      const updated = localElements.find(el => el.id === selectedElement.id);
      if (updated) {
        setSelectedElement(updated);
      } else {
        setSelectedElement(null);
      }
    }
  }, [localElements, selectedElement, setSelectedElement]);

  const equipmentDrawnSize = useCanvasStore(s => s.equipmentDrawnSize);
  const setHasChanges = useEditorStore(s => s.setHasChanges);

  const handleAddEquipment = () => {
    const drawnWidth = equipmentDrawnSize?.width ?? 60;
    const drawnHeight = equipmentDrawnSize?.height ?? 100;
    const derivedCategory = newEquipmentMaterialCategoryCode
      ? getEquipmentCategoryFromMaterial(newEquipmentMaterialCategoryCode)
      : (newEquipmentCategory || 'NETWORK');
    const newEquip: FloorPlanEquipment = {
      id: generateTempId(),
      name: newEquipmentName,
      category: derivedCategory,
      positionX: newEquipmentPosition.x,
      positionY: newEquipmentPosition.y,
      width: drawnWidth,
      height: drawnHeight,
      rotation: 0,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
      materialCategoryId: newEquipmentMaterialCategoryId,
      materialCategoryCode: newEquipmentMaterialCategoryCode,
      materialCategoryName: newEquipmentMaterialCategoryName,
      displayColor: newEquipmentDisplayColor,
      specParams: newEquipmentSpecParams,
      specification: newEquipmentSpecification,
    };
    const newList = [...useEditorStore.getState().localEquipment, newEquip];
    setLocalEquipment(newList);
    pushHistory(useEditorStore.getState().localElements, newList);

    // Track recent material usage
    if (newEquipmentMaterialCategoryId && newEquipmentMaterialCategoryCode && newEquipmentSpecification) {
      addRecent('equipment', {
        categoryId: newEquipmentMaterialCategoryId,
        categoryCode: newEquipmentMaterialCategoryCode,
        categoryName: newEquipmentSpecification,
        specParams: newEquipmentSpecParams ?? {},
        specification: newEquipmentSpecification,
      });
    }

    setEquipmentModalOpen(false);
    setNewEquipmentName('');
    setNewEquipmentCategory('NETWORK');
    resetNewEquipmentMaterial();
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
            {viewMode === 'edit-2d' && !snapshotActive && <ToolPanel />}

            <div className="flex-1 flex flex-col min-w-0 relative">
              {viewMode === 'view-3d' ? (
                <Suspense fallback={
                  <div className="flex-1 flex items-center justify-center bg-gray-200">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">3D 뷰 로딩중...</p>
                    </div>
                  </div>
                }>
                  <div className="flex-1">
                    <ThreeCanvas
                      elements={localElements}
                      racks={[]}
                      equipment={localEquipment}
                      canvasWidth={floorPlan?.canvasWidth ?? 1200}
                      canvasHeight={floorPlan?.canvasHeight ?? 800}
                    />
                  </div>
                </Suspense>
              ) : (
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
              )}

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

              {floorPlan && viewMode === 'edit-2d' && !snapshotActive && (
                <div className="flex items-center">
                  <PropertyBar />
                  <HeightInput />
                </div>
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

      {/* Equipment add modal */}
      {equipmentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">설비 추가</h3>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">설비 이름</label>
              <input
                type="text"
                value={newEquipmentName}
                onChange={(e) => setNewEquipmentName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: UPS-01"
                autoFocus
              />
            </div>
            <div className="mb-4">
              <MaterialPicker
                categoryType="EQUIPMENT"
                value={newEquipmentMaterialCategoryId ? { categoryId: newEquipmentMaterialCategoryId, specParams: newEquipmentSpecParams ?? {} } : null}
                onChange={({ categoryId, categoryCode, categoryName, displayColor, specParams, specification }) => {
                  setNewEquipmentMaterial(categoryId, categoryCode, categoryName, displayColor, specParams, specification);
                }}
                recentItems={recentEquipment}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setEquipmentModalOpen(false); setNewEquipmentName(''); setNewEquipmentCategory('NETWORK'); resetNewEquipmentMaterial(); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handleAddEquipment} disabled={!newEquipmentName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}

      {/* Cable spec selection modal */}
      <CableSpecModalWrapper />

      {/* Infra material selection modal (conduit/tray/pullbox) */}
      {infraMaterialModalOpen && infraMaterialElementId && (
        <InfraMaterialModal elementId={infraMaterialElementId} />
      )}

      {/* Draft recovery dialog */}
      {showDraftDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">저장하지 않은 변경사항이 있습니다</h3>
            <p className="text-sm text-gray-500 mb-4">
              이전에 작업하던 내용을 이어서 편집하거나, 변경사항을 폐기하고 최신 도면을 불러올 수 있습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleDiscardDraft}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                변경사항 폐기
              </button>
              <button
                onClick={handleRestoreDraft}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                이어서 편집
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment paste modal */}
      {pasteEquipmentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">설비 붙여넣기</h3>
            <p className="text-sm text-gray-500 mb-3">복사한 설비의 새 이름을 입력하세요.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">설비 이름</label>
              <input
                type="text"
                value={pasteEquipmentName}
                onChange={(e) => setPasteEquipmentName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && pasteEquipmentName) handlePasteEquipment(); }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: UPS-02"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setPasteEquipmentModalOpen(false); setPasteEquipmentName(''); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handlePasteEquipment} disabled={!pasteEquipmentName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">붙여넣기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
