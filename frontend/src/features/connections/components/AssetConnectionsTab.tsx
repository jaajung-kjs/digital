import { useEffect } from 'react';
import { useAssetConnections } from '../hooks/useAssetConnections';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { PathTraceDetail } from '../../pathTrace/components/PathTraceDetail';

interface Props {
  assetId: string;
}

export function AssetConnectionsTab({ assetId }: Props) {
  const { groups, isLoading } = useAssetConnections(assetId);
  const startTrace = usePathHighlightStore((s) => s.startTrace);
  const openTopology = usePathHighlightStore((s) => s.openTopology);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);

  // 자산 전환(탭 유지) 또는 언마운트 시 이전 자산의 하이라이트 잔상 해제.
  useEffect(() => {
    return () => clearHighlight();
  }, [assetId, clearHighlight]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-content-faint">
        불러오는 중…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-content-faint">
        연결된 케이블이 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {groups.map((group) => (
        <div key={group.key}>
          {/* 그룹 헤더 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border-b border-line">
            {group.color && (
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="text-xs font-semibold text-content-muted">{group.label}</span>
            <span className="ml-auto text-xs text-content-faint">{group.rows.length}</span>
          </div>

          {/* 행 목록 */}
          {group.rows.map((row) => {
            const isActive = tracingCableId === row.cableId;
            const label = `${row.fromName} → ${row.toName}`;
            return (
              <div
                key={row.cableId}
                className={`flex items-center border-b border-line ${isActive ? 'bg-info-bg/40' : 'hover:bg-surface-2'}`}
              >
                {/* 메인 행 버튼 */}
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => startTrace(row.cableId)}
                  className="flex-1 text-left px-3 py-2 text-sm text-content min-w-0"
                >
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <span className="truncate text-sm text-content">{row.fromName}</span>
                    <span className="text-xs text-content-faint flex-shrink-0">→</span>
                    <span className="truncate text-sm text-content">{row.toName}</span>
                  </span>
                </button>

                {/* 상세(토폴로지) 버튼 */}
                <button
                  type="button"
                  aria-label="상세"
                  onClick={() => {
                    startTrace(row.cableId);
                    openTopology();
                  }}
                  className="px-2 py-2 text-xs text-primary hover:text-primary-hover flex-shrink-0"
                  title="네트워크 토폴로지 보기"
                >
                  ↗
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* 경로 추적 상세 패널 */}
      <PathTraceDetail />
    </div>
  );
}
