import {
  computeLayout, opticalPaths, pathBundles, redundancyWarnings, reversePath, rings,
  type LayoutPoint, type OpticalPath, type PathBundle, type PathEnd,
} from '@twin/core';
import type { Network } from '../../model/networkApi';
import { dutyOrder } from './duty';
import type { NetworkView } from './networkSelectors';
import { shortStationName } from './pathChain';

/** 광 계통도의 마디 — 국 하나. 범위 밖 국(경로가 나가 닿은 곳)은 흐리게 그린다. */
export interface MapStation { id: string; name: string; inScope: boolean }
/** 광 계통도의 간선 — 광선로 하나. 같은 국 쌍 사이 여럿이면 `lane` 으로 벌린다. */
export interface MapLine {
  id: string; name: string; a: string; b: string;
  /** 같은 국 쌍 안에서 몇째(0부터) · 모두 몇 가닥. */
  lane: number; lanes: number;
  /** 선 이름표(`선로명 · n심 · km`) 에 쓴다. */
  coreCount: number; lengthKm: number | null;
}
export type Ring = ReturnType<typeof rings>[number];
export type Warning = ReturnType<typeof redundancyWarnings>[number];

export interface OpticalMapModel {
  stations: MapStation[];
  /** 그릴 광선로(두 끝 국이 다른 것) — 범위에 닿은 것과 범위 안 회선이 지나는 것. 같은 국 안 광선로는 마디 위라 선으로 서지 않는다. */
  lines: MapLine[];
  positions: Map<string, LayoutPoint>;
  /**
   * 범위 안 회선(끝이나 지나는 광선로가 범위에 닿은 묶음) — **보이는 방향으로 돌린 것**(범위 안 끝 먼저, 둘 다면 국 이름 순).
   * id·판정은 core 그대로다(방향만 화면의 몫).
   */
  bundles: PathBundle[];
  /** 묶음 → 그 경로들(같은 보이는 방향) — 요약(`북춘천(OFD:1·2)-춘천HP`)을 그리는 데. */
  pathsOf: Map<string, OpticalPath[]>;
  /** 범위 안 경로 미완결 — 설비 끝이 앞(빈 끝이 뒤). 데이터를 채울 목록이다. */
  incomplete: OpticalPath[];
  rings: Ring[];
  warnings: Warning[];
  /** 범위 데이터가 깊이 상한에서 잘렸다 — 「경로가 길어 일부만 불러왔습니다」. */
  truncated: boolean;
}

const NATURAL = new Intl.Collator('ko', { numeric: true });
const byName = <T extends { name: string; id: string }>(x: T, y: T) => NATURAL.compare(x.name, y.name) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** 국 이름 차례 — 현장 표기(`구춘천`·`북춘천`·`신춘천`)의 자연 순. 「(구)」의 괄호가 앞에 서지 않게 줄인 이름으로 견준다. */
const cmpStation = (view: NetworkView, a: string, b: string) =>
  NATURAL.compare(shortStationName(view.substationName(a)), shortStationName(view.substationName(b)));

/**
 * 보이는 방향 — 범위 안 끝이 앞, 둘 다(또는 둘 다 밖)면 국 이름이 앞서는 끝이 앞(현장 표기의 자연 순). 같으면 core 의 정규 방향 그대로.
 * core 의 정규 방향은 설비 id(무작위 uuid) 순이라 화면에서는 뜻이 없다 — 방향은 여기서만 정한다.
 */
function firstIsA(view: NetworkView, inScope: (id: string) => boolean, a: PathEnd, b: PathEnd): boolean {
  const [ia, ib] = [inScope(a.substationId), inScope(b.substationId)];
  if (ia !== ib) return ia;
  return cmpStation(view, a.substationId, b.substationId) <= 0;
}

function orientBundle(b: PathBundle, keep: boolean): PathBundle {
  return keep ? b : { ...b, a: b.b, b: b.a, lineIds: [...b.lineIds].reverse() };
}

/** 묶음의 경로를 묶음과 같은 방향으로 — 끝 설비가 같으면(한 설비로 돌아오는 회선) 광선로 차례로 가린다. */
function alongBundle(p: OpticalPath, b: PathBundle): OpticalPath {
  const seq = (q: OpticalPath) => q.hops.map((h) => h.lineId).join('>');
  const same = b.a.equipmentId === b.b.equipmentId
    ? seq(p) === b.lineIds.join('>')
    : p.start?.equipmentId === b.a.equipmentId;
  return same ? p : reversePath(p);
}

/**
 * 범위 데이터(저장 전 변경을 겹친 것) → 광 계통도 한 장. 판정(사슬·묶음·링·경고·배치)은 모두 core 이고, 여기는 모아
 * **범위로 거르고**(끝이나 지나는 광선로가 범위에 닿은 것만 — 서버가 경계 밖으로 따라간 사슬의 남의 회선은 뺀다)
 * **보이는 방향으로 돌릴** 뿐이다.
 *
 * 마디는 범위 안 국 + 그릴 광선로의 끝 국(저장 전에 새로 닿은 국 — 서버가 모르면 범위 밖으로 본다).
 * 배치는 `computeLayout` — 마디를 이름 순으로 넘겨 같은 자료면 같은 그림이다.
 */
export function buildOpticalMap(view: NetworkView, server: Network | undefined): OpticalMapModel {
  const scope = new Map((server?.substations ?? []).map((s) => [s.id, s.inScope]));
  const inScope = (id: string) => scope.get(id) ?? false;
  const lineOf = new Map(view.input.lines.map((l) => [l.id, l]));
  const lineInScope = (id: string) => { const l = lineOf.get(id); return !!l && (inScope(l.aSubstationId) || inScope(l.bSubstationId)); };

  const all = opticalPaths(view.input);
  const byId = new Map(all.map((p) => [p.id, p]));
  const bundlesAll = pathBundles(all);
  const kept = bundlesAll.filter((b) => inScope(b.a.substationId) || inScope(b.b.substationId) || b.lineIds.some(lineInScope));
  const incomplete = all.filter((p) => !p.complete
    && ([p.start, p.end].some((e) => e && inScope(e.substationId)) || p.hops.some((h) => lineInScope(h.lineId))));

  /* 보이는 방향·차례 — 앞 끝 국 · 앞 설비 · 뒤 끝 국 · 뒤 설비 · 주/예비. */
  const eqName = (e: PathEnd) => view.equipmentName(e.equipmentId) ?? '';
  const bundles = kept.map((b) => orientBundle(b, firstIsA(view, inScope, b.a, b.b)))
    .sort((x, y) => cmpStation(view, x.a.substationId, y.a.substationId) || NATURAL.compare(eqName(x.a), eqName(y.a))
      || cmpStation(view, x.b.substationId, y.b.substationId) || NATURAL.compare(eqName(x.b), eqName(y.b))
      || dutyOrder(x.duty) - dutyOrder(y.duty) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  /* 미완결 — 설비 끝의 국 · 설비 · 첫 코어 차례(uuid 차례는 뜻이 없다). */
  incomplete.sort((x, y) => {
    const [ex, ey] = [x.start ?? x.end, y.start ?? y.end];
    return (ex && ey ? cmpStation(view, ex.substationId, ey.substationId) || NATURAL.compare(eqName(ex), eqName(ey)) : 0)
      || (x.hops[0]?.coreNo ?? 0) - (y.hops[0]?.coreNo ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  });
  const pathsOf = new Map(bundles.map((b) => [
    b.id,
    b.paths.flatMap((id) => { const p = byId.get(id); return p ? [alongBundle(p, b)] : []; })
      .sort((x, y) => (x.hops[0]?.coreNo ?? 0) - (y.hops[0]?.coreNo ?? 0)),
  ]));

  /* 그릴 광선로 — 범위에 닿은 것 + 범위 안 회선·미완결 경로가 지나는 것. */
  const used = new Set<string>();
  for (const b of bundles) b.lineIds.forEach((id) => used.add(id));
  for (const p of incomplete) p.hops.forEach((h) => used.add(h.lineId));
  const drawable = view.input.lines.filter((l) => l.aSubstationId !== l.bSubstationId && (lineInScope(l.id) || used.has(l.id)));

  const ids = new Set([...scope].filter(([, s]) => s).map(([id]) => id));
  for (const l of drawable) { ids.add(l.aSubstationId); ids.add(l.bSubstationId); }
  const stations = [...ids].map((id) => ({ id, name: view.substationName(id), inScope: inScope(id) })).sort(byName);

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = new Map<string, string[]>();
  for (const l of [...drawable].sort((x, y) => NATURAL.compare(lineName(view, x.id), lineName(view, y.id)) || (x.id < y.id ? -1 : 1))) {
    const k = pairKey(l.aSubstationId, l.bSubstationId);
    pairs.set(k, [...(pairs.get(k) ?? []), l.id]);
  }
  const lines: MapLine[] = drawable.map((l) => {
    const lane = pairs.get(pairKey(l.aSubstationId, l.bSubstationId))!;
    const row = view.line(l.id);
    return {
      id: l.id, name: lineName(view, l.id), a: l.aSubstationId, b: l.bSubstationId, lane: lane.indexOf(l.id), lanes: lane.length,
      coreCount: row?.coreCount ?? 0, lengthKm: row?.lengthKm ?? null,
    };
  });

  const positions = computeLayout(stations, drawable.map((l) => ({ source: l.aSubstationId, target: l.bSubstationId })));
  return {
    stations, lines, positions, bundles, pathsOf, incomplete,
    rings: rings(kept), warnings: redundancyWarnings(kept),
    truncated: view.truncated,
  };
}

/** 광선로 이름 — 없으면 양끝 국. */
export function lineName(view: NetworkView, id: string): string {
  const l = view.line(id);
  if (!l) return id;
  return l.name ?? `${view.substationName(l.aSubstationId)} ↔ ${view.substationName(l.bSubstationId)}`;
}

/** 설비 이름 앞에 국 줄임 — `북춘천 송변전광단말장치`(같은 이름의 설비가 국마다 있다). */
export function equipmentLabel(view: NetworkView, end: { equipmentId: string; substationId: string }): string {
  return `${shortStationName(view.substationName(end.substationId))} ${view.equipmentName(end.equipmentId) ?? '—'}`;
}

/**
 * 겹쳐 그릴 것 — 고른 회선(묶음)이 지나는 광선로마다 그 회선들의 주/예비.
 * 같은 광선로를 고른 회선 여럿이 지나면 그 수만큼 겹친다(주회선 실선 · 예비회선 점선 · 주/예비 미지정 옅은 강조색).
 */
export function overlayFor(bundles: readonly PathBundle[], picked: ReadonlySet<string>): Map<string, PathBundle['duty'][]> {
  const out = new Map<string, PathBundle['duty'][]>();
  for (const b of bundles) {
    if (!picked.has(b.id)) continue;
    for (const id of new Set(b.lineIds)) out.set(id, [...(out.get(id) ?? []), b.duty]);
  }
  return out;
}
