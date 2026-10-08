import { CIRCUIT_CURRENTS, powerLedger, powerTree, type CurrentFilter, type PowerBreaker, type PowerInput, type PowerNode } from '@twin/core';
import { bySubstation, effectiveCircuits, effectiveRows, equipmentName } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/**
 * 워킹카피 → 전원 계통 입력(`powerTree`·`powerLedger`). 판정은 core 한 곳이고, 여기는 입력을 모을 뿐이다.
 * 차단기는 effective 차단기(저장 + 변경안, 1..N), 연결은 이 국의 effective 연결.
 */
function powerInput(s: S, substationId: string, filter: CurrentFilter): PowerInput {
  const equipment = bySubstation(effectiveRows(s, 'equipment'), substationId);
  return {
    substationId,
    equipment,
    circuits: equipment.filter((e) => e.circuitCount > 0).flatMap((e) => effectiveCircuits(s, e.id)),
    links: bySubstation(effectiveRows(s, 'links'), substationId),
    filter,
    nameOf: (id) => equipmentName(s, id) ?? '',
  };
}

/** 교류/직류를 적지 않은 차단기 묶음의 이름(모선이 여럿인 설비에서). */
const UNSPECIFIED_BUS = '교류/직류 미지정';

/** 모선 이름 — 「교류 모선」·「직류 모선」, 교류/직류를 적지 않은 묶음은 「교류/직류 미지정」. */
export function busName(current: string | null): string {
  const word = CIRCUIT_CURRENTS.find((c) => c.value === current)?.label;
  return word ? `${word} 모선` : UNSPECIFIED_BUS;
}

/** 차단기 대장 — 공급 설비마다 한 블록(이름 자연 순서). */
export function ledgerBlocks(s: S, substationId: string, filter: CurrentFilter): PowerNode[] {
  return powerLedger(powerInput(s, substationId, filter));
}


/**
 * 계통도의 한 줄 — core `powerTree` 를 위에서 아래로 펼친 것. 줄 종류는 셋이다:
 * - `equipment` — 뿌리(입력 전원이 이 보기 안에 없는 공급 설비의 모선).
 * - `breaker` — 「차단기 n · 표기 · 용량 · 교류/직류 → 부하」. 부하가 차단기를 가진 설비면 그 차단기들이 이 줄의 자식이다.
 * - `group` — 모선이 여럿인 설비의 「교류/직류 미지정」 묶음 머리. 그 설비를 처음 펼친 모선의 차단기들 뒤, 같은 층에 서고
 *   교류/직류를 적지 않은 차단기가 그 아래에 선다(따로 뿌리로 세우지 않는다 — 입력이 없을 뿐 그 분전반의 차단기다).
 */
export interface PowerTreeRow {
  /** 뿌리부터의 길(`r:<설비>[@모선]/<차단기 번호>/…`) — 같은 설비가 두 곳에 서도(이중 입력) 줄마다 다르고, 다시 그려도 그대로다. */
  key: string;
  parentKey: string | null;
  depth: number;
  kind: 'equipment' | 'breaker' | 'group';
  /** 뿌리면 그 설비, 차단기 줄이면 그 차단기를 가진 공급 설비. */
  equipmentId: string;
  breaker: PowerBreaker | null;
  /** 이 줄이 가리키는 설비(누르면 고른다) — 뿌리면 그 설비, 차단기 줄이면 부하 설비(없으면 null). */
  target: string | null;
  /** 가리키는 설비가 공급 설비면 그 모선(`PowerBus.key`) — 「상단 참조」가 같은 (설비, 모선)을 처음 펼친 줄을 찾는다. */
  targetBus: string | null;
  /** 가리키는 설비가 모선이 여럿이면 들어간 모선의 이름(「직류 모선」) — 아니면 null. */
  busLabel: string | null;
  /** 자식 줄이 있다(펼친 공급 설비이고 이 보기에서 보일 차단기가 있다). */
  branch: boolean;
  /** 이 (설비, 모선)을 **처음 펼친** 줄 — 「상단 참조」가 이리로 데려온다. */
  anchor: boolean;
  /** 검색이 훑는 글자(소문자) — 설비 이름, 차단기 표기·용도, 부하 이름. */
  text: string;
}

/** 계통도 줄 — `powerTree` 의 뿌리부터 깊이 순서(차단기 번호 순)로 편다. */
export function treeRows(s: S, substationId: string, filter: CurrentFilter, loadText: (b: PowerBreaker) => string): PowerTreeRow[] {
  const { roots } = powerTree(powerInput(s, substationId, filter));
  const out: PowerTreeRow[] = [];
  const name = (id: string) => equipmentName(s, id) ?? '';
  const lower = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(' ').toLowerCase();
  const labelOf = (n: PowerNode) => (n.multiBus ? busName(n.buses[0]?.current ?? null) : null);
  /* 순환·상단 참조 줄은 child 가 없다 — 그 설비가 모선이 여럿인지는 대장(설비마다 한 번)에서 읽는다. */
  const multi = new Map(powerLedger(powerInput(s, substationId, 'all')).map((n) => [n.equipmentId, n]));
  const busLabelOf = (b: PowerBreaker) => {
    if (b.child) return labelOf(b.child);
    const n = b.load?.kind === 'equipment' ? multi.get(b.load.equipmentId) : undefined;
    if (!n?.multiBus) return null;
    return busName(n.buses.find((x) => x.key === b.loadBus)?.current ?? null);
  };
  const walk = (node: PowerNode, parentKey: string, depth: number) => {
    node.buses.forEach((bus, i) => {
      if (i === 0) { breakers(node.equipmentId, bus.breakers, parentKey, depth); return; }
      const key = `${parentKey}/~${bus.key}`;
      out.push({
        key, parentKey, depth, kind: 'group', equipmentId: node.equipmentId, breaker: null,
        target: null, targetBus: null, busLabel: busName(bus.current),
        branch: bus.breakers.length > 0, anchor: false, text: '',
      });
      breakers(node.equipmentId, bus.breakers, key, depth + 1);
    });
  };
  function breakers(owner: string, list: readonly PowerBreaker[], parentKey: string, depth: number) {
    for (const b of list) {
      const key = `${parentKey}/${b.no}`;
      out.push({
        key, parentKey, depth, kind: 'breaker', equipmentId: owner, breaker: b,
        target: b.load?.kind === 'equipment' ? b.load.equipmentId : null,
        targetBus: b.loadBus,
        busLabel: busLabelOf(b),
        branch: (b.child?.breakers.length ?? 0) > 0,
        anchor: b.child != null,
        text: lower(b.label, b.purpose, loadText(b)),
      });
      if (b.child) walk(b.child, key, depth + 1);
    }
  }
  for (const r of roots) {
    const bus = r.buses[0]?.key ?? '*';
    const key = r.multiBus ? `r:${r.equipmentId}@${bus}` : `r:${r.equipmentId}`;
    out.push({
      key, parentKey: null, depth: 0, kind: 'equipment', equipmentId: r.equipmentId, breaker: null,
      target: r.equipmentId, targetBus: bus, busLabel: labelOf(r),
      branch: r.breakers.length > 0, anchor: true, text: lower(name(r.equipmentId)),
    });
    walk(r, key, 1);
  }
  return out;
}

/**
 * 검색 — 맞는 줄과 그 조상만 남긴다(차례는 그대로). `matched` 는 **맞는 차단기 줄 수**다(조상·설비 줄은 세지 않는다) —
 * 대장의 건수(차단기 줄)와 같은 것을 센다.
 */
export function searchTreeRows(rows: readonly PowerTreeRow[], q: string): { rows: PowerTreeRow[]; matched: number } {
  const needle = q.trim().toLowerCase();
  if (needle === '') return { rows: [...rows], matched: rows.filter((r) => r.kind === 'breaker').length };
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const keep = new Set<string>();
  let matched = 0;
  for (const r of rows) {
    if (!r.text.includes(needle)) continue;
    if (r.kind === 'breaker') matched++;
    for (let k: string | null = r.key; k != null && !keep.has(k); k = byKey.get(k)?.parentKey ?? null) keep.add(k);
  }
  return { rows: rows.filter((r) => keep.has(r.key)), matched };
}

/** 접힌 줄의 자손 전부를 감춘다 — 부모만 보면 손자가 남는다. */
export function visibleTreeRows(rows: readonly PowerTreeRow[], collapsed: ReadonlySet<string>): PowerTreeRow[] {
  const out: PowerTreeRow[] = [];
  let hideDeeperThan: number | null = null;
  for (const r of rows) {
    if (hideDeeperThan !== null && r.depth > hideDeeperThan) continue;
    hideDeeperThan = null;
    out.push(r);
    if (r.branch && collapsed.has(r.key)) hideDeeperThan = r.depth;
  }
  return out;
}
