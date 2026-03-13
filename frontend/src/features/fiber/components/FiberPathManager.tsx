import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useCreateFiberPath, useDeleteFiberPath } from '../hooks/useFiberPaths';
import { usePortStatus } from '../hooks/usePortStatus';
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
  onNavigateRemote?: (remoteRoomId: string) => void;
}

export function FiberPathManager({ ofdId, onPortConnect, onPortDelete, onNavigateRemote }: FiberPathManagerProps) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const createPath = useCreateFiberPath();
  const deletePath = useDeleteFiberPath();

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

  // 자기 자신만 제외, 변전소명으로 필터
  const filteredList = ofdList
    ?.filter((eq) => eq.id !== ofdId)
    .filter((eq) => {
      if (!searchTerm) return true;
      return (eq.substationName ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    }) ?? [];

  const handleCreate = async (targetOfdId: string) => {
    await createPath.mutateAsync({
      ofdAId: ofdId,
      ofdBId: targetOfdId,
      portCount,
    });
    setShowCreate(false);
    setSearchTerm('');
  };

  const handleDelete = async (pathId: string) => {
    if (!confirm('이 광경로를 삭제하시겠습니까?')) return;
    await deletePath.mutateAsync(pathId);
  };

  const getUsageCount = (path: FiberPathDetail): number => {
    return path.ports.filter((p) => p.sideA || p.sideB).length;
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">불러오는 중...</div>;
  }

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
                    disabled={createPath.isPending}
                    className="block w-full text-left rounded px-2 py-1.5 text-sm hover:bg-blue-100 disabled:opacity-50"
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

      {/* Path list */}
      {mergedPaths.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 광경로가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {mergedPaths.map((path) => {
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
                      disabled={deletePath.isPending}
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
