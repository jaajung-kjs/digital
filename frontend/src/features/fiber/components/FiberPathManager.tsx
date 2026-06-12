import { useState } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { generateTempId } from '../../../utils/idHelpers';
import { FiberPortGrid } from './FiberPortGrid';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useOfdDirectoryWithStatus } from '../hooks/useOfdDirectory';
import type { FiberPathDetail } from '../types';

interface FiberPathManagerProps {
  ofdId: string;
  onPortConnect?: (portNumber: number, fiberPathId: string) => void;
  onPortDelete?: (cableId: string) => void;
  onNavigateRemote?: (remoteOfdId: string, remoteFloorId: string) => void;
}

export function FiberPathManager({ ofdId, onPortConnect, onPortDelete, onNavigateRemote }: FiberPathManagerProps) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const stageFiberPathCreate = useSubstationWorkingCopy((s) => s.stageFiberPathCreate);
  const stageFiberPathDelete = useSubstationWorkingCopy((s) => s.stageFiberPathDelete);
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
  // isLoading 은 React Query 가 직접 알려줘야 정확 — size===0 만 보면 "OFD 가
  // 0 개인 신규 배포" 가 영구 로딩 상태로 잘못 표시됨.
  const { directory: ofdDirectory, isLoading: isLoadingOfd } = useOfdDirectoryWithStatus();
  const filteredList = [...ofdDirectory.values()]
    .filter((eq) => eq.id !== ofdId)
    .filter((eq) => {
      if (!searchTerm) return true;
      return (eq.substationName || eq.name).toLowerCase().includes(searchTerm.toLowerCase());
    });

  const handleCreate = (targetOfdId: string) => {
    stageFiberPathCreate({
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
    // 통합 스토어 stage: temp 는 staged-create 제거, saved 는 삭제 마킹 —
    // stageFiberPathDelete 내부에서 isTempId 로 분기 처리.
    stageFiberPathDelete(pathId);
  };

  const getUsageCount = (path: FiberPathDetail): number => {
    return path.ports.filter((p) => p.sideA || p.sideB).length;
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-content-muted">불러오는 중...</div>;
  }

  // mergedPaths 가 이미 usePortStatus 안에서 deletedFiberPathIds 를 필터링했음 (workingCopy/merge.ts).
  const activePaths = mergedPaths;

  return (
    <div className="p-4 border-b border-line">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">경로 슬롯</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover"
        >
          {showCreate ? '취소' : '경로 추가'}
        </button>
      </div>

      {/* Create flow */}
      {showCreate && (
        <div className="mb-4 rounded border border-primary bg-info-bg p-3">
          <div className="mb-2">
            <label className="block text-xs font-medium text-content-muted mb-1">포트 수</label>
            <div className="flex gap-2">
              {([24, 48] as const).map((count) => (
                <button
                  key={count}
                  onClick={() => setPortCount(count)}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    portCount === count
                      ? 'bg-primary text-white'
                      : 'bg-surface text-content-muted border border-line hover:bg-surface-2'
                  }`}
                >
                  {count}코어
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-xs font-medium text-content-muted mb-1">연결할 변전소</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="변전소 검색..."
              className="w-full rounded border border-line px-2 py-1 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {isLoadingOfd ? (
            <p className="text-xs text-content-muted">변전소 목록 불러오는 중...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {filteredList.length === 0 ? (
                <p className="text-xs text-content-faint py-2">연결 가능한 변전소가 없습니다.</p>
              ) : (
                filteredList.map((eq) => (
                  <button
                    key={eq.id}
                    onClick={() => handleCreate(eq.id)}
                    className="block w-full text-left rounded px-2 py-1.5 text-sm hover:bg-info-bg"
                  >
                    <span className="font-medium text-content">
                      {eq.substationName || '알 수 없음'}
                    </span>
                    <span className="ml-1 text-xs text-content-faint">변전소</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Path list — pending + saved 모두 usePortStatus.mergedPaths 에 포함 */}
      {activePaths.length === 0 ? (
        <p className="text-sm text-content-faint">등록된 경로가 없습니다.</p>
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
                className="rounded border border-line bg-surface"
              >
                <div
                  className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-surface-2"
                  onClick={() => togglePath(path)}
                >
                  <div>
                    <span className="text-sm font-medium text-content">
                      {local.substationName} - {remote.substationName}
                    </span>
                    <span className="ml-2 text-xs text-content-faint">
                      {path.portCount}코어
                    </span>
                    <span className="ml-2 text-xs text-content-muted">
                      {usage}/{path.portCount} 사용
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(path.id);
                      }}
                      className="rounded px-2 py-0.5 text-xs text-danger hover:bg-danger-bg"
                    >
                      삭제
                    </button>
                    <span className="text-xs text-content-faint">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-line p-3">
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
