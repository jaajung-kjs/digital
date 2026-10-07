import type { LinkEndRef } from './types.js';
import { endRefKey } from './types.js';
import type { Side } from './vocab.js';
import { biconnectedBlocks } from './topologyLayout.js';

/**
 * 중계경로 파생 — 선번장 코어 사슬에서 「설비 → 코어 → 광선로 → 중계 패치 → … → 설비」를 읽는다.
 * 순수 함수(저장 없음). 망·링 레코드는 두지 않는다 — 주·예비는 쓰는 코어가 달라 저절로 갈린다(스펙 §파생).
 *
 * 사슬 규칙: 코어 끝 (L, n, s) → 같은 코어의 반대 끝 (L, n, s̄) → 그 끝에 걸린 연결의 반대편.
 * - 설비 끝 → 경로의 끝(PathEnd)
 * - 차단기 끝 → 경로의 끝(그 차단기의 설비로 — 미완결이 아니다)
 * - 코어 끝 → **중계 패치**, 그 코어로 다음 홉
 * - 연결 없음 → 경로 미완결(끝 null)
 * 코어 끝마다 연결은 최대 하나라 코어에서 출발한 사슬은 유일하다. 지난 (L, n) 을 다시 만나면(데이터 고리)
 * 멈추고 미완결로 둔다. 판정은 연결 끝의 모양(kind)으로만 — 종류 key 분기 없음.
 */

/** 이 광선로 코어를 from 끝 → to 끝으로 지남. */
export interface PathHop { lineId: string; coreNo: number; from: Side; to: Side }
export interface PathEnd { equipmentId: string; port: string | null; substationId: string }
export interface OpticalPath {
  /** 양끝·홉으로 만든 안정 키 — 어느 쪽에서 추적해도 같다. */
  id: string;
  /** null = 사슬이 설비에 닿지 않음(빈 코어 끝·데이터 고리). */
  start: PathEnd | null;
  end: PathEnd | null;
  /** 순서대로. */
  hops: PathHop[];
  /** 지난 중계 패치(코어↔코어) 연결 id — 순서대로. */
  patches: string[];
  /** 지난 코어들의 주/예비가 모두 같으면 그 값, 섞이거나 비면 null. */
  role: 'main' | 'backup' | null;
  /** 양끝이 설비이고 고리 없음. */
  complete: boolean;
}
export interface NetworkInput {
  lines: { id: string; aSubstationId: string; bSubstationId: string }[];
  cores: { lineId: string; no: number; role: string | null }[];
  links: { id: string; a: LinkEndRef; b: LinkEndRef }[];
  /** 설비의 국 — 모르면 null(그때는 광선로 그 끝의 국). */
  equipmentSubstation: (equipmentId: string) => string | null;
}

/** 자연 순서 — 같으면 코드 단위로 갈라 결정적으로. */
const NATURAL = new Intl.Collator('ko', { numeric: true });
const cmp = (a: string, b: string) => NATURAL.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

const flip = (s: Side): Side => (s === 'A' ? 'B' : 'A');
const coreId = (lineId: string, no: number) => `${lineId}:${no}`;

interface Index {
  /** 코어 끝 키 → 그 끝에 걸린 연결(id 순 첫 것)과 반대편 끝. */
  at: Map<string, { linkId: string; other: LinkEndRef }>;
  role: Map<string, string | null>;
  line: Map<string, { aSubstationId: string; bSubstationId: string }>;
  equipmentSubstation: (id: string) => string | null;
}

function index(net: NetworkInput): Index {
  const at = new Map<string, { linkId: string; other: LinkEndRef }>();
  /* 코어 끝마다 연결은 최대 하나가 규칙이다. 어긋난 자료면 id 가 앞선 것을 쓴다 — 입력 차례와 무관하게. */
  for (const l of [...net.links].sort((x, y) => cmp(x.id, y.id))) {
    for (const [self, other] of [[l.a, l.b], [l.b, l.a]] as const) {
      if (self.kind !== 'core') continue;
      const k = endRefKey(self);
      if (!at.has(k)) at.set(k, { linkId: l.id, other });
    }
  }
  return {
    at,
    role: new Map(net.cores.map((c) => [coreId(c.lineId, c.no), c.role])),
    line: new Map(net.lines.map((l) => [l.id, l])),
    equipmentSubstation: net.equipmentSubstation,
  };
}

/** 사슬 한쪽 — 코어 끝 `from` 에 서서(그 코어를 막 지나 나온 자리) 연결을 따라 끝까지. */
interface Leg { hops: PathHop[]; patches: string[]; end: PathEnd | null; cyclic: boolean }

function follow(ix: Index, from: { lineId: string; no: number; side: Side }, visited: Set<string>): Leg {
  const hops: PathHop[] = [];
  const patches: string[] = [];
  let cur = from;
  for (;;) {
    const hit = ix.at.get(endRefKey({ kind: 'core', lineId: cur.lineId, no: cur.no, side: cur.side }));
    if (!hit) return { hops, patches, end: null, cyclic: false };
    const o = hit.other;
    if (o.kind === 'equipment' || o.kind === 'circuit') {
      const sideSub = ix.line.get(cur.lineId)?.[cur.side === 'A' ? 'aSubstationId' : 'bSubstationId'] ?? '';
      const port = o.kind === 'equipment' ? (o.label ?? null) : null;
      return { hops, patches, end: { equipmentId: o.equipmentId, port, substationId: ix.equipmentSubstation(o.equipmentId) ?? sideSub }, cyclic: false };
    }
    const id = coreId(o.lineId, o.no);
    if (visited.has(id)) return { hops, patches, end: null, cyclic: true };
    visited.add(id);
    patches.push(hit.linkId);
    hops.push({ lineId: o.lineId, coreNo: o.no, from: o.side, to: flip(o.side) });
    cur = { lineId: o.lineId, no: o.no, side: flip(o.side) };
  }
}

const endKey = (e: PathEnd | null) => (e ? `${e.equipmentId}#${e.port ?? ''}` : '~');
const hopKey = (h: PathHop) => `${h.lineId}:${h.coreNo}:${h.from}${h.to}`;

function reversed(p: Omit<OpticalPath, 'id'>): Omit<OpticalPath, 'id'> {
  return {
    ...p,
    start: p.end,
    end: p.start,
    hops: [...p.hops].reverse().map((h) => ({ ...h, from: h.to, to: h.from })),
    patches: [...p.patches].reverse(),
  };
}

/**
 * 방향을 못 박는다 — 끝 키가 앞서는 쪽이 start(빈 끝은 뒤로), 끝이 같으면 홉 열이 앞서는 쪽.
 * 그래서 사슬의 어느 코어 어느 끝에서 추적해도 같은 경로(같은 id·같은 방향)가 나온다.
 */
function canonical(p: Omit<OpticalPath, 'id'>): OpticalPath {
  const r = reversed(p);
  const sig = (x: Omit<OpticalPath, 'id'>) => [endKey(x.start), endKey(x.end), x.hops.map(hopKey).join(',')];
  const [a, b] = [sig(p), sig(r)];
  const order = cmp(a[0]!, b[0]!) || cmp(a[1]!, b[1]!) || cmp(a[2]!, b[2]!);
  const pick = order <= 0 ? p : r;
  const s = sig(pick);
  return { id: `path:${s[0]}|${s[2]}|${s[1]}`, ...pick };
}

function trace(ix: Index, at: { lineId: string; coreNo: number; side: Side }): OpticalPath {
  const visited = new Set([coreId(at.lineId, at.coreNo)]);
  const first: PathHop = { lineId: at.lineId, coreNo: at.coreNo, from: at.side, to: flip(at.side) };
  const fwd = follow(ix, { lineId: at.lineId, no: at.coreNo, side: first.to }, visited);
  const back = follow(ix, { lineId: at.lineId, no: at.coreNo, side: at.side }, visited);
  /* 거꾸로 간 다리는 뒤집어 앞에 붙인다 — 그 다리의 홉은 경로 방향으로는 to → from 이다. */
  const hops = [
    ...[...back.hops].reverse().map((h) => ({ ...h, from: h.to, to: h.from })),
    first,
    ...fwd.hops,
  ];
  const roles = new Set(hops.map((h) => ix.role.get(coreId(h.lineId, h.coreNo)) ?? null));
  const only = roles.size === 1 ? [...roles][0]! : null;
  const cyclic = fwd.cyclic || back.cyclic;
  return canonical({
    start: back.end,
    end: fwd.end,
    hops,
    patches: [...[...back.patches].reverse(), ...fwd.patches],
    role: only === 'main' || only === 'backup' ? only : null,
    complete: back.end !== null && fwd.end !== null && !cyclic,
  });
}

/** 한 코어(그 끝)에서 양방향으로 추적한 중계경로. */
export function traceFromCore(net: NetworkInput, at: { lineId: string; coreNo: number; side: Side }): OpticalPath {
  return trace(index(net), at);
}

/** 설비(·차단기) 끝 ↔ 코어 끝 연결마다 출발한 모든 사슬 — 같은 사슬은 하나로, id 순. */
export function opticalPaths(net: NetworkInput): OpticalPath[] {
  const ix = index(net);
  const out = new Map<string, OpticalPath>();
  for (const l of net.links) {
    for (const [self, other] of [[l.a, l.b], [l.b, l.a]] as const) {
      if (self.kind !== 'core' || other.kind === 'core') continue;
      /* 같은 사슬은 어느 끝에서 추적해도 같은 id 다 — 건너뛰지 않고 모두 추적해 id 로 합친다
         (어긋난 자료에서도 결과가 입력 차례에 매이지 않게). */
      const p = trace(ix, { lineId: self.lineId, coreNo: self.no, side: self.side });
      out.set(p.id, p);
    }
  }
  return [...out.values()].sort((x, y) => cmp(x.id, y.id));
}

/** 같은 설비 쌍·광선로 순서·주예비 — Tx/Rx 두 코어가 한 선. */
export interface PathBundle { id: string; a: PathEnd; b: PathEnd; lineIds: string[]; role: 'main' | 'backup' | null; paths: string[] }

/**
 * 완결 경로를 (정렬된 양끝 설비 쌍, 지나는 광선로 id 순서, 주/예비) 로 묶는다.
 * 설비 쌍은 포트를 보지 않는다 — Tx/Rx 가 다른 포트여도 한 선이다. 묶음 끝의 포트는 경로들이 모두 같을 때만 그 값.
 */
export function pathBundles(paths: OpticalPath[]): PathBundle[] {
  const groups = new Map<string, { a: PathEnd[]; b: PathEnd[]; lineIds: string[]; role: PathBundle['role']; paths: string[] }>();
  for (const p of paths) {
    if (!p.complete || !p.start || !p.end) continue;
    let [a, b, lineIds] = [p.start, p.end, p.hops.map((h) => h.lineId)];
    const swap = cmp(a.equipmentId, b.equipmentId) > 0
      || (a.equipmentId === b.equipmentId && cmp(lineIds.join(','), [...lineIds].reverse().join(',')) > 0);
    if (swap) [a, b, lineIds] = [b, a, [...lineIds].reverse()];
    const key = `bundle:${a.equipmentId}|${b.equipmentId}|${lineIds.join('>')}|${p.role ?? '-'}`;
    const g = groups.get(key) ?? { a: [], b: [], lineIds, role: p.role, paths: [] };
    g.a.push(a); g.b.push(b); g.paths.push(p.id);
    groups.set(key, g);
  }
  const merge = (ends: PathEnd[]): PathEnd => {
    const ports = new Set(ends.map((e) => e.port));
    return { equipmentId: ends[0]!.equipmentId, port: ports.size === 1 ? ends[0]!.port : null, substationId: ends[0]!.substationId };
  };
  return [...groups].map(([id, g]) => ({
    id, a: merge(g.a), b: merge(g.b), lineIds: g.lineIds, role: g.role, paths: [...g.paths].sort(cmp),
  })).sort((x, y) => cmp(x.id, y.id));
}

/** 설비를 마디, 묶음을 간선으로 둔 무향 그래프의 고리 — 이중연결 성분(마디 3 이상). 이름 없음. */
export function rings(bundles: PathBundle[]): { id: string; equipmentIds: string[]; bundleIds: string[] }[] {
  const sorted = [...bundles].sort((x, y) => cmp(x.id, y.id));
  const nodeIds = [...new Set(sorted.flatMap((b) => [b.a.equipmentId, b.b.equipmentId]))].sort(cmp);
  const edges = sorted
    .filter((b) => b.a.equipmentId !== b.b.equipmentId)
    .map((b) => ({ source: b.a.equipmentId, target: b.b.equipmentId }));
  return biconnectedBlocks(nodeIds.map((id) => ({ id })), edges)
    .map((block) => {
      const ids = [...block].sort(cmp);
      const set = new Set(ids);
      /* 두 블록은 마디를 많아야 하나 공유한다 — 양끝이 다 든 묶음은 이 블록 것이다. */
      const bundleIds = sorted
        .filter((b) => b.a.equipmentId !== b.b.equipmentId && set.has(b.a.equipmentId) && set.has(b.b.equipmentId))
        .map((b) => b.id);
      return { id: `ring:${ids.join('|')}`, equipmentIds: ids, bundleIds };
    })
    .sort((x, y) => cmp(x.id, y.id));
}

/** 같은 설비 쌍의 주 묶음과 예비 묶음이 광선로를 하나라도 함께 지나면 — 물리 이중화가 아니다. */
export function redundancyWarnings(bundles: PathBundle[]): { a: string; b: string; sharedLineIds: string[]; mainBundle: string; backupBundle: string }[] {
  const sorted = [...bundles].sort((x, y) => cmp(x.id, y.id));
  const out: { a: string; b: string; sharedLineIds: string[]; mainBundle: string; backupBundle: string }[] = [];
  for (const m of sorted) {
    if (m.role !== 'main') continue;
    for (const k of sorted) {
      if (k.role !== 'backup' || k.a.equipmentId !== m.a.equipmentId || k.b.equipmentId !== m.b.equipmentId) continue;
      const mine = new Set(m.lineIds);
      const shared = [...new Set(k.lineIds.filter((l) => mine.has(l)))].sort(cmp);
      if (shared.length > 0) out.push({ a: m.a.equipmentId, b: m.b.equipmentId, sharedLineIds: shared, mainBundle: m.id, backupBundle: k.id });
    }
  }
  return out;
}
