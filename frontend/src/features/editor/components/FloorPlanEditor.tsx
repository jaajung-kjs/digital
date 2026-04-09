import { useRef, useState, useEffect, Suspense, lazy } from 'react';
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
import { Toolbar } from './Toolbar';
import { ToolPanel } from './ToolPanel';
import { CanvasView } from './CanvasView';
import { PropertyBar } from './PropertyBar';
import { HeightInput } from './HeightInput';
import { ConnectionOverlay } from '../../connections/components/ConnectionOverlay';
import { TopologyModal } from '../../pathTrace/components/TopologyModal';
// EquipmentDetailPanel requires full Equipment object; detail-by-ID wiring is TODO
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { BomPanel } from '../../bom/components/BomPanel';

const ThreeCanvas = lazy(() => import('../../viewer3d/components/ThreeCanvas').then(m => ({ default: m.ThreeCanvas })));

interface FloorPlanEditorProps {
  roomId: string;
}

export function FloorPlanEditor({ roomId }: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAdmin = useIsAdmin();
  const [showHistory, setShowHistory] = useState(false);
  const [showBom, setShowBom] = useState(false);

  const {
    room, floorPlan, roomLoading, planLoading, planError, saveMutation, handleSave,
  } = useFloorPlanData(roomId, containerRef);

  useEditorKeyboard(handleSave);
  const { handlePasteEquipment } = useClipboard();
  const { pushHistory } = useEditorHistory();

  const resetEditor = useEditorStore(s => s.resetEditor);
  // const detailPanelEquipmentId = useEditorStore(s => s.detailPanelEquipmentId);
  const viewMode = useEditorStore(s => s.viewMode);
  const snapshotActive = useSnapshotStore(s => s.active);
  const snapshotLabel = useSnapshotStore(s => s.label);
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
  const pasteEquipmentModalOpen = useCanvasStore(s => s.pasteEquipmentModalOpen);
  const setPasteEquipmentModalOpen = useCanvasStore(s => s.setPasteEquipmentModalOpen);
  const pasteEquipmentName = useCanvasStore(s => s.pasteEquipmentName);
  const setPasteEquipmentName = useCanvasStore(s => s.setPasteEquipmentName);

  // Reset editor store and snapshot on unmount
  useEffect(() => {
    return () => {
      resetEditor();
      useSnapshotStore.getState().exit();
    };
  }, [resetEditor]);

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
    const newEquip: FloorPlanEquipment = {
      id: generateTempId(),
      name: newEquipmentName,
      category: newEquipmentCategory || 'NETWORK',
      positionX: newEquipmentPosition.x,
      positionY: newEquipmentPosition.y,
      width: drawnWidth,
      height: drawnHeight,
      rotation: 0,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
    };
    const newList = [...useEditorStore.getState().localEquipment, newEquip];
    setLocalEquipment(newList);
    pushHistory(useEditorStore.getState().localElements, newList);
    setEquipmentModalOpen(false);
    setNewEquipmentName('');
    setNewEquipmentCategory('NETWORK');
    setHasChanges(true);
    setTool('select');
  };

  const isPlanNotFound = planError && (planError as { response?: { status: number } }).response?.status === 404;
  const isLoading = roomLoading || planLoading;

  if (isLoading && !isPlanNotFound) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-gray-100 overflow-hidden">
      <Toolbar
        room={room}
        floorPlan={floorPlan}
        isAdmin={isAdmin}
        handleSave={handleSave}
        isSaving={saveMutation.isPending}
        onToggleHistory={() => setShowHistory(p => !p)}
        onToggleBom={() => setShowBom(p => !p)}
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
                  roomId={roomId}
                >
                  <ConnectionOverlay roomId={roomId} canvasRef={canvasRef} />
                </CanvasView>
              )}

              <TopologyModal />

              {/* TODO: Wire EquipmentDetailPanel with proper data fetching by equipmentId */}

              {showHistory && (
                <ChangeHistoryPanel roomId={roomId} onClose={() => setShowHistory(false)} />
              )}

              {showBom && viewMode === 'edit-2d' && (
                <BomPanel roomId={roomId} roomName={room?.name} onClose={() => setShowBom(false)} />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">분류</label>
              <select
                value={newEquipmentCategory}
                onChange={(e) => setNewEquipmentCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="NETWORK">네트워크</option>
                <option value="CHARGER">충전기</option>
                <option value="UPS">UPS</option>
                <option value="DISTRIBUTION_BOARD">분전반</option>
                <option value="OFD">OFD</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setEquipmentModalOpen(false); setNewEquipmentName(''); setNewEquipmentCategory('NETWORK'); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handleAddEquipment} disabled={!newEquipmentName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">추가</button>
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
