import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEditorStore } from '../../editor/stores/editorStore';
import { generateTempId, isTempId } from '../../../utils/idHelpers';
import { FiberPortGrid } from './FiberPortGrid';
import type { FiberPathDetail } from '../types';

interface OfdEquipment {
  id: string;
  name: string;
  substationName?: string;
}

interface FiberPathManagerProps {
  ofdId: string;
  onPortConnect?: (portNumber: number, fiberPathId: string) => void;
  onPortDelete?: (cableId: string) => void;
  onPortSwitch?: (cableId: string, connectedEquipmentId: string, newFiberPathId: string, newPortNumber: number) => void;
  onNavigateRemote?: (remoteRoomId: string) => void;
}

export function FiberPathManager({ ofdId, onPortConnect, onPortDelete, onPortSwitch, onNavigateRemote }: FiberPathManagerProps) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const addPendingFiberPath = useEditorStore((s) => s.addPendingFiberPath);
  const removePendingFiberPath = useEditorStore((s) => s.removePendingFiberPath);
  const deleteFiberPath = useEditorStore((s) => s.deleteFiberPath);
  const pendingFiberPaths = useEditorStore((s) => s.pendingFiberPaths);
  const deletedFiberPathIds = useEditorStore((s) => s.deletedFiberPathIds);

  const [expandedPathId, setExpandedPathId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [portCount, setPortCount] = useState<24 | 48>(24);
  const [searchTerm, setSearchTerm] = useState('');

  // OFD 목록을 변전소 단위로 그룹핑
  const { data: ofdList, isLoading: isLoadingOfd } = useQuery({
    queryKey: ['equipment', 'ofd-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: OfdEquipment[] }>('/equipment', {
        params: { category: 'OFD' },
      });
      return data.data;
    },
    enabled: showCreate,
  });

  // Merge unsaved OFD equipment from local store
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const unsavedOfds: OfdEquipment[] = localEquipment
    .filter((eq) => isTempId(eq.id) && eq.materialCategoryCode?.startsWith('EQP-OFD'))
    .map((eq) => ({ id: eq.id, name: eq.name }));

  const mergedOfdList = [
    ...(ofdList ?? []),
    ...unsavedOfds.filter((u) => !(ofdList ?? []).some((s) => s.id === u.id)),
  ];

  // 자기 자신만 제외, 변전소명으로 필터
  const filteredList = mergedOfdList
    .filter((eq) => eq.id !== ofdId)
    .filter((eq) => {
      if (!searchTerm) return true;
      return (eq.substationName ?? eq.name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    });

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
    if (!confirm('이 광경로를 삭제하시겠습니까?')) return;
    if (isTempId(pathId)) {
      // Pending path: just remove from store
      removePendingFiberPath(pathId);
    } else {
      // Saved path: mark for deletion on save
      deleteFiberPath(pathId);
    }
  };

  // Build pending paths as FiberPathDetail-like objects for display
  const pendingPathsForThisOfd = pendingFiberPaths.filter(
    (fp) => fp.ofdAId === ofdId || fp.ofdBId === ofdId
  );

  const getUsageCount = (path: FiberPathDetail): number => {
    return path.ports.filter((p) => p.sideA || p.sideB).length;
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">불러오는 중...</div>;
  }

  // Filter out paths marked for deletion
  const activePaths = mergedPaths.filter((p) => !deletedFiberPathIds.includes(p.id));

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">광경로 슬롯</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
        >
          {showCreate ? '취소' : '광경로 추가'}
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

      {/* Pending fiber paths */}
      {pendingPathsForThisOfd.length > 0 && (
        <div className="space-y-2 mb-2">
          {pendingPathsForThisOfd.map((fp) => (
            <div key={fp.id} className="rounded border border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    새 광경로
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {fp.portCount}코어
                  </span>
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    미저장
                  </span>
                </div>
                <button
                  onClick={() => removePendingFiberPath(fp.id)}
                  className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saved path list */}
      {activePaths.length === 0 && pendingPathsForThisOfd.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 광경로가 없습니다.</p>
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
                  onClick={() => setExpandedPathId(isExpanded ? null : path.id)}
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
                    <FiberPortGrid fiberPath={path} localOfdId={ofdId} onPortConnect={onPortConnect} onPortDelete={onPortDelete} onPortSwitch={onPortSwitch} onNavigateRemote={onNavigateRemote} />
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
