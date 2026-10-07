import {
  computeLayout, opticalPaths, pathBundles, redundancyWarnings, rings,
  type LayoutPoint, type OpticalPath, type PathBundle,
} from '@twin/core';
import type { Network } from '../../model/networkApi';
import type { NetworkView } from './networkSelectors';
import { shortStationName } from './pathChain';

/** 광 계통도의 마디 — 국 하나. 범위 밖 국(경로가 나가 닿은 곳)은 흐리게 그린다. */
export interface MapStation { id: string; name: string; inScope: boolean }
/** 광 계통도의 간선 — 광선로 하나. 같은 국 쌍 사이 여럿이면 `lane` 으로 벌린다. */
export interface MapLine {
  id: string; name: string; a: string; b: string;
  /** 같은 국 쌍 안에서 몇째(0부터) · 모두 몇 가닥. */
  lane: number; lanes: number;
}
export type Ring = ReturnType<typeof rings>[number];
export type Warning = ReturnType<typeof redundancyWarnings>[number];

export interface OpticalMapModel {
  stations: MapStation[];
  /** 그릴 수 있는 광선로(두 끝 국이 다른 것) — 같은 국 안 광선로는 마디 위라 선으로 서지 않는다. */
  lines: MapLine[];
  positions: Map<string, LayoutPoint>;
  bundles: PathBundle[];
  rings: Ring[];
  warnings: Warning[];
  /** 묶음의 첫 경로 — 요약 한 줄(`북춘천-(9)-춘천HP`)을 그리는 데. */
  pathOf: Map<string, OpticalPath>;
}

const NATURAL = new Intl.Collator('ko', { numeric: true });
const byName = <T extends { name: string; id: string }>(x: T, y: T) => NATURAL.compare(x.name, y.name) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/**
 * 범위 데이터(저장 전 변경을 겹친 것) → 광 계통도 한 장. 판정(사슬·묶음·링·경고·배치)은 모두 core 이고, 여기는 모을 뿐이다.
 *
 * 마디는 서버가 준 국(범위 안·밖) + 광선로 끝 국(저장 전에 새로 닿은 국 — 서버가 모르면 범위 밖으로 본다).
 * 배치는 `computeLayout` — 마디를 이름 순으로 넘겨 같은 자료면 같은 그림이다.
 */
export function buildOpticalMap(view: NetworkView, server: Network | undefined): OpticalMapModel {
  const scope = new Map((server?.substations ?? []).map((s) => [s.id, s.inScope]));
  const ids = new Set(scope.keys());
  for (const l of view.input.lines) { ids.add(l.aSubstationId); ids.add(l.bSubstationId); }
  const stations = [...ids].map((id) => ({ id, name: view.substationName(id), inScope: scope.get(id) ?? false })).sort(byName);

  const drawable = view.input.lines.filter((l) => l.aSubstationId !== l.bSubstationId);
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = new Map<string, string[]>();
  for (const l of [...drawable].sort((x, y) => NATURAL.compare(lineName(view, x.id), lineName(view, y.id)) || (x.id < y.id ? -1 : 1))) {
    const k = pairKey(l.aSubstationId, l.bSubstationId);
    pairs.set(k, [...(pairs.get(k) ?? []), l.id]);
  }
  const lines: MapLine[] = drawable.map((l) => {
    const lane = pairs.get(pairKey(l.aSubstationId, l.bSubstationId))!;
    return { id: l.id, name: lineName(view, l.id), a: l.aSubstationId, b: l.bSubstationId, lane: lane.indexOf(l.id), lanes: lane.length };
  });

  const positions = computeLayout(stations, drawable.map((l) => ({ source: l.aSubstationId, target: l.bSubstationId })));
  const paths = opticalPaths(view.input);
  const bundles = pathBundles(paths);
  const byId = new Map(paths.map((p) => [p.id, p]));
  const pathOf = new Map(bundles.flatMap((b) => {
    const p = byId.get(b.paths[0]!);
    return p ? [[b.id, p] as const] : [];
  }));
  return { stations, lines, positions, bundles, rings: rings(bundles), warnings: redundancyWarnings(bundles), pathOf };
}

function lineName(view: NetworkView, id: string): string {
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
 * 같은 광선로를 고른 회선 여럿이 지나면 그 수만큼 겹친다(주회선 실선 · 예비회선 점선 · 구분 없음 회색).
 */
export function overlayFor(bundles: readonly PathBundle[], picked: ReadonlySet<string>): Map<string, PathBundle['role'][]> {
  const out = new Map<string, PathBundle['role'][]>();
  for (const b of bundles) {
    if (!picked.has(b.id)) continue;
    for (const id of new Set(b.lineIds)) out.set(id, [...(out.get(id) ?? []), b.role]);
  }
  return out;
}
