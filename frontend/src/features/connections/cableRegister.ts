import { roleAt } from '../cables/cableEndpoint';
import { buildSelfSideChecker, buildEndpointNameResolver } from './endpointName';
import { fiberSlotLabel } from '../fiber/fiberSlotLabel';
import { toMapById } from '../../utils/byId';
import type { TraceGraph } from '../trace/traceGraph';
import type { Asset } from '../../types/asset';

type Cable = TraceGraph['cables'][number];
interface CategoryGroup { key: string; label: string; color: string | null }

/**
 * 연결탭 "케이블 명세" 데이터 — 이 자산(+자식)에 **직접 닿는 케이블**을 종류별로 모은다.
 * 회로추적(buildConnectionDiagram) 없이 isSelf(끝점)만으로 1행=케이블 1개. 분배 노드(피더)가
 * 끼면 그 노드의 IN 케이블을 부모, OUT 케이블들을 자식으로 중첩(계통뷰 피더→CB 와 동일 계층).
 */
export interface CableRow {
  cable: Cable;
  selfId: string;
  remoteId: string | null;
  fromName: string;
  toName: string;
  roleAtSelf: string | null;
  number: number | null;
}
export interface FeederGroup { feederId: string; feederName: string; inRow: CableRow | null; outRows: CableRow[]; }
export interface CableSection { key: string; label: string; color: string | null; feeders: FeederGroup[]; rows: CableRow[]; }

export function buildCableRegister(opts: {
  graph: TraceGraph;
  assets: Asset[];
  assetId: string;
  categoryGroupOf: (c: { categoryId?: string | null; cableType?: string | null; displayColor?: string | null }) => CategoryGroup;
}): CableSection[] {
  const { graph, assets, assetId, categoryGroupOf } = opts;
  const isSelf = buildSelfSideChecker(assets, assetId);
  const nameOf = buildEndpointNameResolver(assets);
  const byId = toMapById(assets);
  // 끝점 이름은 파생 SSOT 로 해소 — 경로슬롯(conduit)은 저장된 raw name(시드=자국-대국 / UI생성=대국만)이
  // 제각각이라, 어디서나 같은 fiberSlotLabel("자국-대국-N#코어")을 쓴다. 저장 전후·시드/UI 무관 동일.
  const resolveName = (id?: string | null) => {
    if (!id) return '';
    const a = byId.get(id);
    if (a && a.assetType?.role === 'slot') return fiberSlotLabel(id, graph) || nameOf(id) || id;
    return nameOf(id) || graph.nameById.get(id) || id;
  };
  const isFeeder = (id?: string | null) => !!id && byId.get(id)?.assetType?.role === 'feeder';

  // 표시는 항상 "내 쪽(self) → 상대(remote)" — 케이블 저장 방향(source/target)과 무관하게
  // 보는 자산이 무조건 먼저. selfId/remoteId 가 그 방향의 단일 출처(휴리스틱·역전 분기 없음).
  const toRow = (c: Cable): CableRow => {
    const selfId = (isSelf(c.sourceAssetId) ? c.sourceAssetId : c.targetAssetId) as string;
    const remoteId = selfId === c.sourceAssetId ? (c.targetAssetId ?? null) : (c.sourceAssetId ?? null);
    return {
      cable: c,
      selfId,
      remoteId,
      fromName: resolveName(selfId),
      toName: resolveName(remoteId),
      roleAtSelf: roleAt(c, selfId),
      number: c.number ?? null,
    };
  };

  const sections = new Map<string, CableSection>();
  const feederMap = new Map<string, FeederGroup>();
  const sec = (cg: CategoryGroup) => {
    let s = sections.get(cg.key);
    if (!s) { s = { key: cg.key, label: cg.label, color: cg.color, feeders: [], rows: [] }; sections.set(cg.key, s); }
    else if (!s.color && cg.color) s.color = cg.color;
    return s;
  };

  for (const c of graph.cables) {
    if (!isSelf(c.sourceAssetId) && !isSelf(c.targetAssetId)) continue;
    const s = sec(categoryGroupOf(c));
    const row = toRow(c);
    const feederId = [c.sourceAssetId, c.targetAssetId].find((e) => isFeeder(e) && isSelf(e)) ?? null;
    if (feederId) {
      let fg = feederMap.get(feederId);
      if (!fg) { fg = { feederId, feederName: resolveName(feederId), inRow: null, outRows: [] }; feederMap.set(feederId, fg); s.feeders.push(fg); }
      if (roleAt(c, feederId) === 'IN') fg.inRow = row; else fg.outRows.push(row);
    } else {
      s.rows.push(row);
    }
  }

  // 행 정렬: 내 쪽 역할 IN(공급받음/트렁크=OPGW) 위 → OUT(분배/코어패치) 아래, 그다음 이름순.
  // (피더는 구조상 IN 부모 + OUT 자식이라 이미 IN/OUT 순.)
  const roleRank = (r: string | null) => (r === 'IN' ? 0 : r === 'OUT' ? 2 : 1);
  const out = [...sections.values()];
  for (const s of out) {
    s.rows.sort((a, b) => roleRank(a.roleAtSelf) - roleRank(b.roleAtSelf) || a.toName.localeCompare(b.toName));
    s.feeders.sort((a, b) => a.feederName.localeCompare(b.feederName));
    for (const f of s.feeders) f.outRows.sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.toName.localeCompare(b.toName));
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
