import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { CABLE_TYPES } from '../../../types/connection';
import { SectionEmpty } from '../../assets/components/detail/SectionShell';
import { formatCableLength } from '../../../utils/cable/pathLength';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { floorAnchor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { tracePathToRoot, type PathToRoot } from '../tracePathToRoot';
import { buildEndpointNameResolver } from '../endpointName';
import type { AssetConnection } from '../hooks/useEffectiveAssetConnections';

// 종류별 표시 순서(프로젝트 CABLE_TYPES 의 value 순서).
const TYPE_ORDER: string[] = CABLE_TYPES.map((t) => t.value);
const TYPE_LABEL = new Map<string, string>(CABLE_TYPES.map((t) => [t.value, t.label]));

interface Props {
  assetId: string;
  connections: AssetConnection[];
  /** 현재 활성 floor — 추적 결과에서 "외부 구간(다른 층/변전소)" 판정에 사용. */
  activeFloorId?: string | null;
}

interface Entry {
  conn: AssetConnection;
  path: PathToRoot;
}

/**
 * 연결 탭 — 경로중심 읽기전용 뷰.
 *
 * 자산의 직접 연결을 종류별로 묶어, 각 연결을 "상대명 → … → root명" 경로로 보여준다.
 * 항목 클릭 → 통합 trace store(usePathHighlightStore)로 캔버스 하이라이트. 활성 항목을 다시
 * 클릭하면 해제. 활성 경로에 외부 구간(현재 층 밖 노드)이 있으면 [상세] → 토폴로지 모달.
 *
 * 편집(유형/라벨/삭제)은 캔버스로 이동 — 이 탭에는 편집 UI 가 없다(읽기전용).
 */
export function AssetConnectionsSection({ assetId, connections, activeFloorId }: Props) {
  const effectiveCables = useEffectiveCables();
  const effectiveAssets = useEffectiveAssets();
  // 이 자산의 표시명 — 경로 시작점("이자산 → … → root")으로 쓴다. 단일 이름 소스 재사용.
  const selfName = useMemo(
    () => buildEndpointNameResolver(effectiveAssets)(assetId) || '(미상)',
    [effectiveAssets, assetId],
  );
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const highlightedNodeIds = usePathHighlightStore((s) => s.highlightedNodeIds);
  const traceActive = usePathHighlightStore((s) => s.active);

  // 종류별로 묶고, 각 연결의 root 까지 경로를 계산.
  const groups = useMemo(() => {
    const byType = new Map<string, Entry[]>();
    for (const conn of connections) {
      const path = tracePathToRoot(assetId, conn.id, effectiveCables, effectiveAssets);
      const list = byType.get(conn.cableType) ?? [];
      list.push({ conn, path });
      byType.set(conn.cableType, list);
    }
    // CABLE_TYPES 순서로 정렬, 알 수 없는 종류는 뒤로.
    return [...byType.entries()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]);
      const ib = TYPE_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [connections, assetId, effectiveCables, effectiveAssets]);

  // 활성 추적에 외부 구간(현재 층 밖 / cross-substation)이 있는가.
  // 추적된 노드를 floorAnchor 로 해소해 그 floorId 가 activeFloorId 와 다르면 외부.
  const hasExternal = useMemo(() => {
    if (!traceActive || !activeFloorId) return false;
    const byId = toMapById(effectiveAssets);
    for (const nodeId of highlightedNodeIds) {
      const anchor = floorAnchor(nodeId, byId);
      // 앵커가 없으면(이 변전소에 없는 원격 노드) 외부로 본다.
      if (!anchor || anchor.floorId !== activeFloorId) return true;
    }
    return false;
  }, [traceActive, activeFloorId, highlightedNodeIds, effectiveAssets]);

  if (!connections.length) return <SectionEmpty>연결 없음</SectionEmpty>;

  const onEntryClick = (cableId: string) => {
    if (tracingCableId === cableId) usePathHighlightStore.getState().clearHighlight();
    else usePathHighlightStore.getState().startTrace(cableId);
  };

  return (
    <div className="space-y-3">
      {groups.map(([type, entries]) => (
        <div key={type}>
          <h4 className="text-xs font-semibold text-content-muted mb-1">{TYPE_LABEL.get(type) ?? type}</h4>
          <div className="space-y-0.5">
            {entries.map(({ conn, path }) => {
              const active = tracingCableId === conn.id;
              return (
                <div key={conn.id} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => onEntryClick(conn.id)}
                    aria-pressed={active}
                    className={`flex-1 min-w-0 text-left rounded px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active ? 'bg-primary/10 text-primary' : 'hover:bg-surface-2'
                    }`}
                  >
                    <RouteLine selfName={selfName} path={path} conn={conn} assetId={assetId} />
                  </button>
                  <span className="text-xs text-content-muted tabular-nums shrink-0 w-12 text-right">
                    {formatCableLength(conn.totalLength)}
                  </span>
                  {active && hasExternal && (
                    <button
                      type="button"
                      onClick={() => usePathHighlightStore.getState().openTopology()}
                      className="text-xs shrink-0 inline-flex items-center gap-0.5 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded px-1"
                    >
                      상세 <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * "이자산 → … → root" 한 줄 — 시작은 이 자산, 끝(root/도착)은 강조, 중간은 … 로 생략.
 * (전체 노드별 체인은 클릭 시 PathTraceDetail 이 보여준다 — 여기선 직관적 요약.)
 */
function RouteLine({
  selfName,
  path,
  conn,
  assetId,
}: {
  selfName: string;
  path: PathToRoot;
  conn: AssetConnection;
  assetId: string;
}) {
  const chain = path.chain;
  // 도착명: root 있으면 root, 없으면 체인 끝, 둘 다 없으면 연결 상대(폴백).
  const otherName = conn.source.assetId === assetId ? conn.target.name : conn.source.name;
  const dest = path.root?.name ?? (chain.length ? chain[chain.length - 1].name : otherName) ?? '(미상)';
  const hasMiddle = chain.length >= 2; // 시작·도착 사이에 중간 노드가 있음.

  const arrow = <span className="shrink-0 text-content-faint">→</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate text-content-muted">{selfName}</span>
      {arrow}
      {hasMiddle && (
        <>
          <span className="shrink-0 text-content-faint">…</span>
          {arrow}
        </>
      )}
      <span className="truncate font-semibold text-content">{dest}</span>
    </span>
  );
}
