import type { LinkEndRef } from './types.js';
import { endRefKey } from './types.js';
import { rowsForCount } from './rows.js';

/**
 * 전원 계통 파생 — 공급 설비별 차단기, 차단기의 부하, 입력 전원 → 차단기 → 부하로 이어지는 트리. 순수 함수(저장 없음).
 *
 * 방향은 저장하지 않는다 — **차단기(회로 행)를 가진 쪽이 공급**이다(스펙 §국 내 연결).
 * 그래서 「설비 끝 ↔ 차단기 끝」 연결 하나가 곧 「차단기 쪽 설비가 설비 끝 쪽에 전원을 준다」이다.
 * 차단기 ↔ 차단기 연결은 어느 쪽이 공급인지 말할 수 없어 공급으로 세지 않고, 양쪽 부하를 `other` 로 둔다.
 * 판정은 「차단기가 있는가(circuitCount > 0)」로만 가른다 — 종류 key 분기 없음.
 */
export type CurrentFilter = 'all' | 'AC' | 'DC';
/** 이 설비가 전원을 받는 차단기. */
export interface PowerFeed { equipmentId: string; circuitNo: number; linkId: string }
export interface PowerNode {
  equipmentId: string;
  /** 입력 전원(0..n) — 거르기와 무관하게 모두. */
  feeds: PowerFeed[];
  /** 이 설비의 차단기 1..circuitCount (거르기 적용 후). */
  breakers: PowerBreaker[];
}
export interface PowerBreaker {
  no: number; label: string | null; current: string | null; voltage: string | null; capacity: string | null;
  phase: string | null; switch: string | null; purpose: string | null;
  /** 이 차단기 끝의 연결. */
  linkId: string | null;
  /** null = 예비. */
  load: { kind: 'equipment'; equipmentId: string; port: string | null } | { kind: 'other'; ref: LinkEndRef } | null;
  cableTypeId: string | null; lengthM: number | null;
  /** 부하 설비가 차단기를 가지면 그 아래(재귀). */
  child: PowerNode | null;
  /** 이 부하는 이미 다른 가지에서 펼쳤다 — child 는 null. */
  repeat: boolean;
  /** 이 부하가 위로 올라가는 길에 이미 있다 — child 는 null. */
  cycle: boolean;
}

interface EquipmentIn { id: string; substationId: string; name: string; circuitCount: number }
interface CircuitIn {
  equipmentId: string; no: number; label: string | null; current: string | null; voltage: string | null; capacity: string | null;
  phase: string | null; switch: string | null; purpose: string | null;
}
interface LinkIn { id: string; substationId: string; cableTypeId: string | null; lengthM: number | null; a: LinkEndRef; b: LinkEndRef }

/** 이름 자연 순서 — 한 번 만들어 모든 비교가 함께 쓴다. */
const NAME_ORDER = new Intl.Collator('ko', { numeric: true });

export function powerTree(input: {
  substationId: string;
  equipment: EquipmentIn[];
  circuits: CircuitIn[];
  links: LinkIn[];
  filter: CurrentFilter;
  nameOf: (equipmentId: string) => string;
}): { roots: PowerNode[]; unfed: string[] } {
  const { substationId, equipment, circuits, links, filter, nameOf } = input;

  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  /* 사람이 읽는 이름은 자연 순서로(분전반2 < 분전반10). 같은 이름이면 id 로. */
  const byName = (a: string, b: string) => NAME_ORDER.compare(nameOf(a), nameOf(b)) || cmp(a, b);

  // 이 국의 공급 설비 = 차단기를 가진 설비.
  const supply = new Map<string, EquipmentIn>();
  for (const e of equipment) if (e.substationId === substationId && e.circuitCount > 0) supply.set(e.id, e);

  // 차단기 행 = 저장된 회로 + 기본 행(1..N, 값 null). N 밖의 저장 행은 버린다.
  const stored = new Map<string, CircuitIn>();
  for (const c of circuits) stored.set(`${c.equipmentId}:${c.no}`, c);
  const rowsOf = (e: EquipmentIn): CircuitIn[] =>
    rowsForCount([], e.circuitCount).create.map((no) => stored.get(`${e.id}:${no}`) ?? {
      equipmentId: e.id, no, label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null,
    });
  const passes = (current: string | null) => filter === 'all' || current === filter;
  /** 이 보기에서 보이는 이 국의 차단기인가. */
  const visibleBreaker = (equipmentId: string, no: number) => {
    const e = supply.get(equipmentId);
    if (!e || no < 1 || no > e.circuitCount) return false;
    return passes(stored.get(`${equipmentId}:${no}`)?.current ?? null);
  };

  // 끝 키 → 연결(끝마다 첫 하나 — id 순이라 입력 순서에 흔들리지 않는다).
  // 한 끝에 연결이 둘 이상 걸리면(검증이 막는 흠) 차단기의 부하·연결 칸은 id 첫 연결만 보인다.
  // 다만 입력 전원(feeds)은 연결마다 세므로, 가려진 연결도 그 설비의 입력 전원으로는 남을 수 있다.
  // 차단기 ↔ 차단기 연결은 어느 쪽이 공급인지 정할 수 없어(둘 다 회로 행을 가짐) 입력 전원으로 세지 않는다 —
  // 양쪽 차단기의 부하는 모두 `other` 이고, 그 너머로 내려가지 않는다.
  const own = links.filter((l) => l.substationId === substationId).sort((x, y) => cmp(x.id, y.id));
  const byEnd = new Map<string, { link: LinkIn; other: LinkEndRef }>();
  const feedsOf = new Map<string, PowerFeed[]>();
  for (const l of own) {
    const ka = endRefKey(l.a);
    const kb = endRefKey(l.b);
    if (!byEnd.has(ka)) byEnd.set(ka, { link: l, other: l.b });
    if (!byEnd.has(kb)) byEnd.set(kb, { link: l, other: l.a });
    // 설비 끝 ↔ 남의 차단기 끝 = 입력 전원.
    for (const [x, y] of [[l.a, l.b], [l.b, l.a]] as const) {
      if (x.kind !== 'equipment' || y.kind !== 'circuit' || x.equipmentId === y.equipmentId) continue;
      const arr = feedsOf.get(x.equipmentId) ?? [];
      arr.push({ equipmentId: y.equipmentId, circuitNo: y.no, linkId: l.id });
      feedsOf.set(x.equipmentId, arr);
    }
  }
  for (const arr of feedsOf.values()) {
    arr.sort((p, q) => byName(p.equipmentId, q.equipmentId) || p.circuitNo - q.circuitNo || cmp(p.linkId, q.linkId));
  }
  const feeds = (id: string) => feedsOf.get(id) ?? [];

  const expanded = new Set<string>();
  const build = (e: EquipmentIn, path: Set<string>): PowerNode => {
    expanded.add(e.id);
    path.add(e.id);
    const breakers: PowerBreaker[] = rowsOf(e).filter((c) => passes(c.current)).map((c) => {
      const hit = byEnd.get(endRefKey({ kind: 'circuit', equipmentId: e.id, no: c.no }));
      const other = hit?.other ?? null;
      const load: PowerBreaker['load'] = other === null
        ? null
        : other.kind === 'equipment'
          ? { kind: 'equipment', equipmentId: other.equipmentId, port: other.label ?? null }
          : { kind: 'other', ref: other };
      let child: PowerNode | null = null;
      let repeat = false;
      let cycle = false;
      const sub = load?.kind === 'equipment' ? supply.get(load.equipmentId) : undefined;
      if (sub) {
        if (path.has(sub.id)) cycle = true;
        else if (expanded.has(sub.id)) repeat = true;
        else child = build(sub, path);
      }
      return {
        no: c.no, label: c.label, current: c.current, voltage: c.voltage, capacity: c.capacity,
        phase: c.phase, switch: c.switch, purpose: c.purpose,
        linkId: hit?.link.id ?? null,
        load,
        cableTypeId: hit?.link.cableTypeId ?? null, lengthM: hit?.link.lengthM ?? null,
        child, repeat, cycle,
      };
    });
    path.delete(e.id);
    return { equipmentId: e.id, feeds: feeds(e.id), breakers };
  };

  const ordered = [...supply.keys()].sort(byName);
  // 뿌리 = 이 보기에서 보이는 이 국 차단기로부터 받는 입력 전원이 없는 공급 설비.
  // (거르기 'all' 이면 스펙 그대로 「입력 없음 + 모두 국 밖/알 수 없음」. 직류 보기에서 교류로만 받는 충전기는 뿌리가 된다.)
  const rootIds = ordered.filter((id) => !feeds(id).some((f) => visibleBreaker(f.equipmentId, f.circuitNo)));
  const built: PowerNode[] = rootIds.map((id) => build(supply.get(id)!, new Set()));
  // 순환만으로 이어진 무리는 정식 뿌리가 없다 — 펼쳐지지 않은 공급 설비를 이름 순으로 뿌리로 세워 빠뜨리지 않는다.
  for (const id of ordered) if (!expanded.has(id)) built.push(build(supply.get(id)!, new Set()));
  // 교류/직류 보기에서는 보일 차단기가 하나도 없는 뿌리를 뺀다(예: 직류 보기의 교류 전용 반). unfed 는 그대로.
  const roots = filter === 'all' ? built : built.filter((n) => n.breakers.length > 0);

  const unfed = ordered.filter((id) => feeds(id).length === 0);
  return { roots, unfed };
}
