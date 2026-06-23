import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { makeCategoryGroupOf } from '../hooks/useAssetConnections';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { buildInternalPath } from '../internalPath';
import { buildCableRegister, type CableRow } from '../cableRegister';
import { CableInspector } from '../../cables/components/CableInspector';
import { CablePathTree } from './CablePathTree';

/**
 * 연결탭 = 이 자산(+자식)에 직접 닿는 케이블 명세. 종류별 섹션(최소화/확장), 분배 노드(피더)는
 * IN→OUT 중첩. 행 클릭 = 그 케이블 정밀 선택 + 하단 고정 상세 카드 편집 + 도면 하이라이트
 * (setSelectedComponent → useSelectionHighlight 기존 파이프라인). 경로상세 인라인은 2단계.
 */
interface Props { assetId: string }

/**
 * 케이블 행 — **모듈 레벨**(컴포넌트 내부 정의 금지). 내부에 두면 리렌더마다 새 함수 타입이라
 * React 가 행 전체를 unmount/remount → 스크롤 컨테이너의 행이 제거되며 scrollTop 이 0 으로
 * 클램프(=클릭 시 리스트 맨 위로 점프). 모듈 레벨이면 같은 타입이라 DOM 을 재사용 → 스크롤 보존.
 */
function Row({ r, indent, selected, onPick }: { r: CableRow; indent?: boolean; selected: boolean; onPick: (r: CableRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(r)}
      className={`flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-surface-2 ${indent ? 'pl-7' : ''} ${selected ? 'border-l-2 border-l-primary bg-info-bg/30' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate text-content">
        {r.fromName} <span className="text-content-faint">→</span> {r.toName}
      </span>
      {(r.roleAtSelf || r.number != null) && (
        <span className="shrink-0 text-xs text-content-faint">
          {r.roleAtSelf ?? ''}{r.number != null ? ` ·#${r.number}` : ''}
        </span>
      )}
    </button>
  );
}

export function AssetConnectionsTab({ assetId }: Props) {
  const assets = useEffectiveAssets();
  const { graph, isLoading } = useTraceGraph();
  const { data: categories } = useCableCategories();
  const selectedCableId = useSelectionStore((s) => s.selectedCableId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => {
    if (!graph || !categories) return [];
    return buildCableRegister({ graph, assets, assetId, categoryGroupOf: makeCategoryGroupOf(categories) });
  }, [graph, categories, assets, assetId]);

  // 선택 케이블의 내부경로(현재 변전소 안). 설비=종단으로 폭발 방지, 밖은 토폴로지.
  const localPath = useMemo(() => {
    if (!selectedCableId || !graph) return null;
    return buildInternalPath(selectedCableId, graph.subById.get(assetId) ?? null, graph);
  }, [selectedCableId, graph, assetId]);

  if (isLoading) return <div className="py-8 text-center text-xs text-content-faint">불러오는 중…</div>;
  if (sections.length === 0) return <div className="py-8 text-center text-xs text-content-faint">연결된 케이블이 없습니다.</div>;

  // 행 클릭 = 토글 선택. 선택 시 도면 하이라이트(기존) + 하단 고정 상세 카드.
  const pick = (r: CableRow) => {
    const sel = useSelectionStore.getState();
    if (sel.selectedCableId === r.cable.id) sel.setSelected(assetId, null);
    else sel.setSelectedComponent(assetId, r.number, r.cable.id);
  };

  return (
    // 패널 높이를 꽉 채워 리스트만 스크롤, 선택 카드는 하단에 진짜 고정(접기 등 콘텐츠 변화와 무관).
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
      {sections.map((s) => {
        const count = s.rows.length + s.feeders.reduce((n, f) => n + (f.inRow ? 1 : 0) + f.outRows.length, 0);
        const isOpen = !collapsed[s.key];
        return (
          <div key={s.key}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [s.key]: !c[s.key] }))}
              className="flex w-full items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 hover:bg-surface-3"
            >
              {isOpen ? <ChevronDown size={15} className="shrink-0 text-content-faint" /> : <ChevronRight size={15} className="shrink-0 text-content-faint" />}
              {s.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />}
              <span className="text-sm font-semibold text-content">{s.label}</span>
              <span className="ml-auto text-xs text-content-faint">{count}</span>
            </button>
            {isOpen && (
              <>
                {s.feeders.map((f) => (
                  <div key={f.feederId}>
                    {f.inRow && <Row r={f.inRow} selected={selectedCableId === f.inRow.cable.id} onPick={pick} />}
                    {f.outRows.map((r) => <Row key={r.cable.id} r={r} indent selected={selectedCableId === r.cable.id} onPick={pick} />)}
                  </div>
                ))}
                {s.rows.map((r) => <Row key={r.cable.id} r={r} selected={selectedCableId === r.cable.id} onPick={pick} />)}
              </>
            )}
          </div>
        );
      })}
      </div>

      {/* 선택한 케이블 — 하단 고정 영역: 경로(드릴다운) + 속성 카드. 높이 상한 + 자체 스크롤. */}
      {selectedCableId && (
        <div className="max-h-[55%] shrink-0 space-y-2 overflow-y-auto p-2">
          {localPath && (
            <div className="rounded-lg border border-line bg-info-bg/40 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-content-muted">경로</span>
                {localPath.crossed && (
                  <button
                    type="button"
                    onClick={() => usePathHighlightStore.getState().prepareTopology(selectedCableId)}
                    className="text-xs text-primary hover:text-primary-hover"
                    title="전체 경로를 토폴로지로 보기"
                  >
                    토폴로지 ↗
                  </button>
                )}
              </div>
              <CablePathTree tree={localPath.tree} selectedCableId={selectedCableId} />
            </div>
          )}
          <CableInspector cableId={selectedCableId} onDeleted={() => useSelectionStore.getState().setSelected(assetId, null)} />
        </div>
      )}
    </div>
  );
}
