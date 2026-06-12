import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CABLE_TYPES } from '../../../types/connection';
import { SectionEmpty } from '../../assets/components/detail/SectionShell';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { floorAnchor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { tracePathToRoot, type PathToRoot } from '../tracePathToRoot';
import type { AssetConnection } from '../hooks/useEffectiveAssetConnections';
import type { Asset } from '../../../types/asset';

type CableMeta = (typeof CABLE_TYPES)[number];
const CABLE_META = new Map<string, CableMeta>(CABLE_TYPES.map((t) => [t.value as string, t]));
const TYPE_ORDER: string[] = CABLE_TYPES.map((t) => t.value);

interface Props {
  assetId: string;
  connections: AssetConnection[];
  /** 현재 활성 floor — 경로의 "외부 구간(다른 층/변전소)" 판정에 사용. */
  activeFloorId?: string | null;
}

interface Entry {
  conn: AssetConnection;
  path: PathToRoot;
  external: boolean;
}

/**
 * 경로에 외부 구간이 있는가(정적 판정 — 활성 추적과 무관).
 *  - root 가 OFD 면 광경로가 다른 변전소로 이어질 수 있어 외부.
 *  - 체인 노드 중 현재 층 밖(다른 floor / 원격)이 있으면 외부.
 */
function pathHasExternal(
  path: PathToRoot,
  activeFloorId: string | null | undefined,
  byId: Map<string, Asset>,
): boolean {
  if (path.root?.kind === 'OFD') return true;
  if (!activeFloorId) return false;
  for (const n of path.chain) {
    const anchor = floorAnchor(n.assetId, byId);
    if (!anchor || anchor.floorId !== activeFloorId) return true;
  }
  return false;
}

/**
 * 연결 탭 — 경로중심 읽기전용 뷰(비즈니스 UI).
 *
 * 자산의 연결을 케이블 종류별로 묶어(종류 색점 + 라벨 + 개수), 각 연결을 "이자산 → … → root"
 * 한 줄 요약으로 보여준다. 행 클릭 → 통합 trace 로 도면 하이라이트(선택 상태 = info 배경 + 좌측
 * navy accent). 외부 구간이 있는 행에는 ↗(외부망) 아이콘 → 토폴로지 모달.
 *
 * 편집(유형/라벨/삭제)은 캔버스로 — 이 탭에는 편집 UI 가 없다.
 * 전체 노드별 상세 경로는 클릭 시 하단 PathTraceDetail 이 담당.
 */
export function AssetConnectionsSection({ assetId, connections, activeFloorId }: Props) {
  const effectiveCables = useEffectiveCables();
  const effectiveAssets = useEffectiveAssets();
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);

  const groups = useMemo(() => {
    const byId = toMapById(effectiveAssets);
    const byType = new Map<string, Entry[]>();
    // 같은 (시작 자산 → 도착) 경로는 하나로 묶는다 — 같은 OFD 로 가는 여러 포트/케이블은 한 항목.
    const seen = new Set<string>();
    for (const conn of connections) {
      const path = tracePathToRoot(assetId, conn.id, effectiveCables, effectiveAssets);
      const destId = path.root?.assetId ?? path.chain[path.chain.length - 1]?.assetId ?? conn.id;
      const key = `${conn.cableType}|${path.start.assetId}|${destId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const external = pathHasExternal(path, activeFloorId, byId);
      const list = byType.get(conn.cableType) ?? [];
      list.push({ conn, path, external });
      byType.set(conn.cableType, list);
    }
    return [...byType.entries()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]);
      const ib = TYPE_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [connections, assetId, effectiveCables, effectiveAssets, activeFloorId]);

  if (!connections.length) return <SectionEmpty>연결 없음</SectionEmpty>;

  const onRowClick = (cableId: string) => {
    if (tracingCableId === cableId) usePathHighlightStore.getState().clearHighlight();
    else void usePathHighlightStore.getState().startTrace(cableId);
  };
  const onTopology = async (cableId: string) => {
    if (tracingCableId !== cableId) await usePathHighlightStore.getState().startTrace(cableId);
    usePathHighlightStore.getState().openTopology();
  };

  return (
    <div className="space-y-4">
      {groups.map(([type, entries]) => {
        const meta = CABLE_META.get(type);
        return (
          <section key={type}>
            <header className="mb-1 flex items-center gap-1.5 px-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: meta?.color ?? 'rgb(var(--text-muted))' }}
              />
              <span className="text-[12px] font-medium text-content-muted">{meta?.label ?? type}</span>
              <span className="ml-auto text-[11px] tabular-nums text-content-faint">{entries.length}</span>
            </header>
            <ul className="space-y-px">
              {entries.map(({ conn, path, external }) => {
                const active = tracingCableId === conn.id;
                return (
                  <li
                    key={conn.id}
                    className={`group flex items-stretch rounded transition-colors ${
                      active ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onRowClick(conn.id)}
                      title="도면에서 경로 하이라이트"
                      className="min-w-0 flex-1 rounded px-2 py-1.5 text-left text-[13px] focus-ring"
                    >
                      <RouteLine path={path} />
                    </button>
                    {external && (
                      <button
                        type="button"
                        onClick={() => void onTopology(conn.id)}
                        title="외부망 토폴로지 보기"
                        aria-label="외부망 토폴로지"
                        className="mr-1 shrink-0 self-center rounded p-1 text-content-faint transition-colors hover:bg-surface-3 hover:text-primary focus-ring"
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * "근접자산 → … → root" 한 줄 요약 — 시작은 케이블의 실제 근접 자산(모듈 등), 도착(root/끝)은
 * 강조, 중간은 … 로 생략. (전체 노드별 체인은 클릭 시 PathTraceDetail.)
 */
function RouteLine({ path }: { path: PathToRoot }) {
  const chain = path.chain;
  const dest = path.root?.name ?? (chain.length ? chain[chain.length - 1].name : null);
  const hasMiddle = chain.length >= 2;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate text-content-muted">{path.start.name}</span>
      {dest && (
        <>
          <span className="shrink-0 text-content-faint">→</span>
          {hasMiddle && (
            <>
              <span className="shrink-0 text-content-faint">…</span>
              <span className="shrink-0 text-content-faint">→</span>
            </>
          )}
          <span className="truncate font-medium text-content">{dest}</span>
        </>
      )}
    </span>
  );
}
