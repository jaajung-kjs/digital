import { useState } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEditorStore } from '../../editor/stores/editorStore';
import { generateTempId, isTempId } from '../../../utils/idHelpers';
import { FiberPortGrid } from './FiberPortGrid';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useOfdDirectory } from '../hooks/useOfdDirectory';
import type { FiberPathDetail } from '../types';

interface FiberPathManagerProps {
  ofdId: string;
  onPortConnect?: (portNumber: number, fiberPathId: string) => void;
  onPortDelete?: (cableId: string) => void;
  onNavigateRemote?: (remoteRoomId: string) => void;
}

export function FiberPathManager({ ofdId, onPortConnect, onPortDelete, onNavigateRemote }: FiberPathManagerProps) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const addPendingFiberPath = useEditorStore((s) => s.addPendingFiberPath);
  const removePendingFiberPath = useEditorStore((s) => s.removePendingFiberPath);
  const deleteFiberPath = useEditorStore((s) => s.deleteFiberPath);
  const [expandedPathId, setExpandedPathId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [portCount, setPortCount] = useState<24 | 48>(24);
  const [searchTerm, setSearchTerm] = useState('');

  // 경로 row 클릭 = 컨텍스트 변경 (닫기든 다른 path 로 옮기든) — 직전 path 의 trace 가
  // active 면 종료. expand 가 곧 "이 path 의 cable 들 본다" 이므로 그 컨텍스트가 끝나면
  // trace 도 끝나야 자연스러움.
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const togglePath = (path: FiberPathDetail) => {
    const isCollapsing = expandedPathId === path.id;
    // 직전 expandedPathId 가 있고 그 path 안의 cable 이 trace 중이면 clear.
    if (tracingCableId && expandedPathId) {
      const prevPath = activePaths.find((p) => p.id === expandedPathId);
      const tracedInPrev = prevPath?.ports.some(
        (p) => p.sideA?.cableId === tracingCableId || p.sideB?.cableId === tracingCableId,
      );
      if (tracedInPrev) clearHighlight();
    }
    setExpandedPathId(isCollapsing ? null : path.id);
  };

  // Picker 용 OFD 목록 — useOfdDirectory 가 saved + 로컬 unsaved 합쳐 줌.
  const ofdDirectory = useOfdDirectory();
  const filteredList = [...ofdDirectory.values()]
    .filter((eq) => eq.id !== ofdId)
    .filter((eq) => {
      if (!searchTerm) return true;
      return (eq.substationName || eq.name).toLowerCase().includes(searchTerm.toLowerCase());
    });
  const isLoadingOfd = ofdDirectory.size === 0;

  const handleCreate = (targetOfdId: string) => {
    addPendingFiberPath({
      id: generateTempId(),
      ofdAId: ofdId,
      ofdBId: targetOfdId,
      portCount,
    });
    setShowCreate(false);
    setSearchTerm('');
  };

  const handleDelete = async (pathId: string) => {
    if (!confirm('이 경로를 삭제하시겠습니까?')) return;
    if (isTempId(pathId)) {
      // Pending path: just remove from store
      removePendingFiberPath(pathId);
    } else {
      // Saved path: mark for deletion on save
      deleteFiberPath(pathId);
    }
  };

  const getUsageCount = (path: FiberPathDetail): number => {
    return path.ports.filter((p) => p.sideA || p.sideB).length;
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">불러오는 중...</div>;
  }

  // mergedPaths 가 이미 usePortStatus 안에서 deletedFiberPathIds 를 필터링했음 (workingCopy/merge.ts).
  const activePaths = mergedPaths;

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">경로 슬롯</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
        >
          {showCreate ? '취소' : '경로 추가'}
        </button>
      </div>

      {/* Create flow */}
      {showCreate && (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3">
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">포트 수</label>
            <div className="flex gap-2">
              {([24, 48] as const).map((count) => (
                <button
                  key={count}
                  onClick={() => setPortCount(count)}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    portCount === count
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {count}코어
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">연결할 변전소</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="변전소 검색..."
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {isLoadingOfd ? (
            <p className="text-xs text-gray-500">변전소 목록 불러오는 중...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {filteredList.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">연결 가능한 변전소가 없습니다.</p>
              ) : (
                filteredList.map((eq) => (
                  <button
                    key={eq.id}
                    onClick={() => handleCreate(eq.id)}
                    className="block w-full text-left rounded px-2 py-1.5 text-sm hover:bg-blue-100"
                  >
                    <span className="font-medium text-gray-700">
                      {eq.substationName || '알 수 없음'}
                    </span>
                    <span className="ml-1 text-xs text-gray-400">변전소</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Path list — pending + saved 모두 usePortStatus.mergedPaths 에 포함 */}
      {activePaths.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 경로가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {activePaths.map((path) => {
            const local = path.ofdA.id === ofdId ? path.ofdA : path.ofdB;
            const remote = path.ofdA.id === ofdId ? path.ofdB : path.ofdA;
            const usage = getUsageCount(path);
            const isExpanded = expandedPathId === path.id;

            return (
              <div
                key={path.id}
                className="rounded border border-gray-200 bg-white"
              >
                <div
                  className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-gray-50"
                  onClick={() => togglePath(path)}
                >
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      {local.substationName} - {remote.substationName}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {path.portCount}코어
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {usage}/{path.portCount} 사용
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(path.id);
                      }}
                      className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                    >
                      삭제
                    </button>
                    <span className="text-xs text-gray-400">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-3">
                    <FiberPortGrid fiberPath={path} localOfdId={ofdId} onPortConnect={onPortConnect} onPortDelete={onPortDelete} onNavigateRemote={onNavigateRemote} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
