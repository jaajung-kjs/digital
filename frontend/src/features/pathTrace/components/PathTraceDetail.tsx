import { usePathHighlightStore } from '../stores/pathHighlightStore';

export function PathTraceDetail() {
  const active = usePathHighlightStore((s) => s.active);
  const projection = usePathHighlightStore((s) => s.projection);
  const clearHighlight = usePathHighlightStore((s) => s.clearHighlight);
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const openTopology = usePathHighlightStore((s) => s.openTopology);

  // "상세" = 이미 활성화된 trace 결과를 그대로 네트워크 토폴로지 모달에 띄움(재추적 없음).
  const handleOpenTopology = () => {
    if (tracingCableId) openTopology();
  };

  if (!active || !projection || projection.steps.length === 0) return null;

  return (
    <div className="border-t border-line bg-info-bg/50 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-primary">경로</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenTopology(); }}
            className="text-xs text-primary hover:text-primary-hover font-medium"
            title="이 장비가 속한 전체 네트워크망 보기"
          >
            상세
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearHighlight(); }}
            className="text-xs text-content-faint hover:text-content"
          >
            닫기
          </button>
        </div>
      </div>

      <div className="max-h-32 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-y-1">
          {projection.steps.map((item, i) => (
            <span key={`${item.id}-${i}`} className="inline-flex items-center">
              {i > 0 && (
                <span className={`mx-1 text-xs ${item.isFiberEdge ? 'text-purple-400' : 'text-content-faint'}`}>
                  {item.isFiberEdge ? '┄' : '→'}
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-xs leading-tight ${
                  item.isEndpoint
                    ? 'bg-info-bg text-primary font-medium'
                    : 'bg-surface-2 text-content-muted'
                }`}
              >
                {item.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
