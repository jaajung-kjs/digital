import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useIsAdmin } from '../../../stores/authStore';
import type { RackItem } from '../../../types/floorPlan';
import { useFloorPlanData } from '../hooks/useFloorPlanData';
import { useEditorKeyboard } from '../hooks/useEditorKeyboard';
import { useClipboard } from '../hooks/useClipboard';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { Toolbar } from './Toolbar';
import { ToolPanel } from './ToolPanel';
import { CanvasView } from './CanvasView';
import { PropertyBar } from './PropertyBar';

interface FloorPlanEditorProps {
  roomId: string;
}

export function FloorPlanEditor({ roomId }: FloorPlanEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAdmin = useIsAdmin();

  const {
    room, floorPlan, roomLoading, planLoading, planError, saveMutation, handleSave,
  } = useFloorPlanData(roomId, containerRef);

  useEditorKeyboard(handleSave);
  const { handlePasteRack } = useClipboard();
  const { pushHistory } = useEditorHistory();

  const localElements = useEditorStore(s => s.localElements);
  const localRacks = useEditorStore(s => s.localRacks);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const setHasChanges = useEditorStore(s => s.setHasChanges);
  const setLocalRacks = useEditorStore(s => s.setLocalRacks);
  const setTool = useEditorStore(s => s.setTool);
  const rackModalOpen = useCanvasStore(s => s.rackModalOpen);
  const setRackModalOpen = useCanvasStore(s => s.setRackModalOpen);
  const newRackName = useCanvasStore(s => s.newRackName);
  const setNewRackName = useCanvasStore(s => s.setNewRackName);
  const newRackPosition = useCanvasStore(s => s.newRackPosition);
  const pasteRackModalOpen = useCanvasStore(s => s.pasteRackModalOpen);
  const setPasteRackModalOpen = useCanvasStore(s => s.setPasteRackModalOpen);
  const pasteRackName = useCanvasStore(s => s.pasteRackName);
  const setPasteRackName = useCanvasStore(s => s.setPasteRackName);

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

  const handleAddRack = () => {
    const newRack: RackItem = {
      id: `temp-${Date.now()}`,
      name: newRackName,
      code: null,
      positionX: newRackPosition.x,
      positionY: newRackPosition.y,
      width: 60,
      height: 100,
      rotation: 0,
      totalU: 12,
      frontImageUrl: null,
      rearImageUrl: null,
      description: null,
    };
    const newRacks = [...localRacks, newRack];
    setLocalRacks(newRacks);
    pushHistory(localElements, newRacks);
    setRackModalOpen(false);
    setNewRackName('');
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
            <ToolPanel />

            <div className="flex-1 flex flex-col min-w-0">
              <CanvasView
                canvasRef={canvasRef}
                containerRef={containerRef}
                floorPlan={floorPlan}
                roomId={roomId}
              />

              {floorPlan && <PropertyBar />}
            </div>
          </>
        )}
      </div>

      {/* Rack add modal */}
      {rackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">랙 추가</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">랙 이름</label>
              <input
                type="text"
                value={newRackName}
                onChange={(e) => setNewRackName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: RACK-A01"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRackModalOpen(false); setNewRackName(''); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handleAddRack} disabled={!newRackName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}

      {/* Rack paste modal */}
      {pasteRackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">랙 붙여넣기</h3>
            <p className="text-sm text-gray-500 mb-3">복사한 랙의 새 이름을 입력하세요.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">랙 이름</label>
              <input
                type="text"
                value={pasteRackName}
                onChange={(e) => setPasteRackName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && pasteRackName) handlePasteRack(); }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: RACK-A02"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setPasteRackModalOpen(false); setPasteRackName(''); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handlePasteRack} disabled={!pasteRackName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">붙여넣기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
