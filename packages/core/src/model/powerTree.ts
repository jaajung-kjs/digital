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
/**
 * 모선 — 한 공급 설비 안에서 같은 갈래의 입력 전원과 차단기를 묶은 것.
 * 입력 전원에 교류·직류가 함께 들어오는 설비(통신용 분전반: 교류는 소내전원반, 직류는 충전기)는 **갈래마다 한 모선**이고,
 * 그 밖의 설비는 모선 하나(`key: '*'`, `current: null`)다.
 */
export interface PowerBus {
  /** 설비 안에서 모선을 가르는 열쇠 — 모선 하나면 `'*'`, 여럿이면 갈래(`'AC'`·`'DC'`, 갈래 없음은 `'-'`). */
  key: string;
  /** 모선의 갈래 — 모선이 하나뿐인 설비와 갈래 없는 모선은 null. */
  current: string | null;
  /** 이 모선으로 들어오는 입력 전원(받는 차단기의 갈래로 가른다) — 거르기와 무관하게 모두. */
  feeds: PowerFeed[];
  /** 이 모선의 차단기(거르기 적용 후, 번호 순). */
  breakers: PowerBreaker[];
}
export interface PowerNode {
  equipmentId: string;
  /** 입력 전원(0..n) — 모선·거르기와 무관하게 이 설비의 것 모두. */
  feeds: PowerFeed[];
  /**
   * 모선 — 대장에서는 이 설비의 모선 전부. 트리에서는 **이 자리에 펼친 모선 하나**다
   * (차단기를 따라 들어온 모선 — 충전기 직류 차단기 아래의 분전반이면 그 직류 모선만).
   */
  buses: PowerBus[];
  /** 이 설비의 모선이 둘 이상이다(교류·직류를 함께 받는다) — 화면이 모선 이름을 붙일지 정한다. */
  multiBus: boolean;
  /** `buses` 의 차단기를 번호 순으로 이어 붙인 것(거르기 적용 후). */
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
  /** 부하가 공급 설비면 이 차단기가 들어가는 그 설비의 모선(`PowerBus.key`), 아니면 null. */
  loadBus: string | null;
  /** 부하 설비가 차단기를 가지면 그 아래(재귀) — 들어간 모선 하나만. */
  child: PowerNode | null;
  /** 이 부하(그 모선)는 이미 다른 가지에서 펼쳤다 — child 는 null. */
  repeat: boolean;
  /** 이 부하(그 모선)가 위로 올라가는 길에 이미 있다 — child 는 null. 같은 갈래로 되돌아갈 때만이다(UPS 교류 → 분전반 교류 모선). */
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

export interface PowerInput {
  substationId: string;
  equipment: EquipmentIn[];
  circuits: CircuitIn[];
  links: LinkIn[];
  filter: CurrentFilter;
  nameOf: (equipmentId: string) => string;
}

/** 트리와 대장이 함께 쓰는 판정 — 공급 설비·차단기 행·끝 → 연결·입력 전원. */
function derive(input: PowerInput) {
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
  /** 저장된 차단기의 갈래 — 기본 행·국 밖 차단기는 null. */
  const currentOf = (equipmentId: string, no: number) => stored.get(`${equipmentId}:${no}`)?.current ?? null;

  // 모선 — 입력 전원의 갈래(받는 차단기의 갈래)가 둘 이상이면 갈래마다 한 모선, 아니면 모선 하나('*').
  const multi = new Set<string>();
  for (const id of supply.keys()) {
    const cs = new Set(feeds(id).map((f) => currentOf(f.equipmentId, f.circuitNo)).filter((c): c is string => c != null));
    if (cs.size > 1) multi.add(id);
  }
  /** 갈래 c 의 차단기(또는 갈래 c 차단기에서 받는 입력)가 서는 모선. */
  const busKeyOf = (supplyId: string, c: string | null) => (multi.has(supplyId) ? c ?? '-' : '*');
  /** 모선의 차례 — 갈래 이름 순(교류 AC < 직류 DC), 갈래 없음은 끝. */
  const busOrder = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b));

  /** 이 보기에서 보이는 차단기 행과 그 부하·연결 — 아래 가지(child·repeat·cycle)는 부르는 쪽이 정한다. */
  const breakersOf = (e: EquipmentIn): PowerBreaker[] => rowsOf(e).filter((c) => passes(c.current)).map((c) => {
    const hit = byEnd.get(endRefKey({ kind: 'circuit', equipmentId: e.id, no: c.no }));
    const other = hit?.other ?? null;
    const load: PowerBreaker['load'] = other === null
      ? null
      : other.kind === 'equipment'
        ? { kind: 'equipment', equipmentId: other.equipmentId, port: other.label ?? null }
        : { kind: 'other', ref: other };
    const sub = load?.kind === 'equipment' ? supply.get(load.equipmentId) : undefined;
    return {
      no: c.no, label: c.label, current: c.current, voltage: c.voltage, capacity: c.capacity,
      phase: c.phase, switch: c.switch, purpose: c.purpose,
      linkId: hit?.link.id ?? null,
      load,
      cableTypeId: hit?.link.cableTypeId ?? null, lengthM: hit?.link.lengthM ?? null,
      loadBus: sub ? busKeyOf(sub.id, c.current) : null,
      child: null, repeat: false, cycle: false,
    };
  });

  /**
   * 이 설비의 모선 — 이 보기에서 보이는 차단기를 갈래로 가른다. 모선 목록은 거르기와 무관하다
   * (거른 보기에서 차단기가 하나도 안 보이는 모선도 빈 채로 남는다 — 숨길지는 부르는 쪽이 정한다).
   */
  const busesOf = (e: EquipmentIn): PowerBus[] => {
    const breakers = breakersOf(e);
    if (!multi.has(e.id)) return [{ key: '*', current: null, feeds: feeds(e.id), breakers }];
    const cs = new Set<string | null>([
      ...feeds(e.id).map((f) => currentOf(f.equipmentId, f.circuitNo)),
      ...rowsOf(e).map((c) => c.current),
    ]);
    return [...cs].sort(busOrder).map((c) => ({
      key: busKeyOf(e.id, c),
      current: c,
      feeds: feeds(e.id).filter((f) => currentOf(f.equipmentId, f.circuitNo) === c),
      breakers: breakers.filter((b) => b.current === c),
    }));
  };

  const ordered = [...supply.keys()].sort(byName);
  return { filter, supply, ordered, feeds, visibleBreaker, busesOf, multi, busKeyOf, currentOf };
}

const flat = (buses: readonly PowerBus[]) => buses.flatMap((b) => b.breakers).sort((x, y) => x.no - y.no);

/**
 * 차단기 대장 — **공급 설비마다 한 번씩**, 이름 자연 순서. 트리와 같은 판정(입력 전원·차단기·부하·모선)이되
 * 아래로 내려가지 않는다(child 없음) — 이중 입력·순환의 설비도 제 블록 하나로 꼭 한 번 선다.
 * 교류·직류를 함께 받는 설비는 모선마다 차단기를 묶어 돌려준다(`buses`).
 * 거르기는 차단기 행에만 걸고, 보일 차단기가 없는 설비도 그대로 돌려준다(빈 블록을 숨길지는 보는 쪽이 정한다).
 */
export function powerLedger(input: PowerInput): PowerNode[] {
  const { supply, ordered, feeds, busesOf, multi } = derive(input);
  return ordered.map((id) => {
    const buses = busesOf(supply.get(id)!);
    return { equipmentId: id, feeds: feeds(id), buses, multiBus: multi.has(id), breakers: flat(buses) };
  });
}

/**
 * 계통도 — 입력 전원에서 부하까지. 펼침·순환·중복은 **(설비, 모선)** 마다 가린다:
 * 충전기 직류 차단기 → 통신용 분전반이면 그 분전반의 직류 모선으로 내려가고(교류 모선 아래에서 왔어도 순환이 아니다),
 * 같은 갈래로 되돌아갈 때만(UPS 교류 → 분전반 교류 모선) 순환이다.
 */
export function powerTree(input: PowerInput): { roots: PowerNode[] } {
  const { filter, supply, ordered, feeds, visibleBreaker, busesOf, multi, busKeyOf, currentOf } = derive(input);
  const pair = (id: string, bus: string) => `${id}|${bus}`;

  // 설비마다 모선을 한 번만 짓는다(거르기 적용).
  const busesById = new Map(ordered.map((id) => [id, busesOf(supply.get(id)!)]));

  const expanded = new Set<string>();
  const build = (e: EquipmentIn, busKey: string, path: Set<string>): PowerNode => {
    const me = pair(e.id, busKey);
    expanded.add(me);
    path.add(me);
    const bus = busesById.get(e.id)!.find((b) => b.key === busKey)!;
    const breakers = bus.breakers.map((b) => {
      const sub = b.load?.kind === 'equipment' ? supply.get(b.load.equipmentId) : undefined;
      if (!sub) return b;
      // 들어갈 모선 — 그 설비에 없으면(입력으로 세지 않는 제 차단기 → 제 설비 등) 첫 모선.
      const subBuses = busesById.get(sub.id)!;
      const key = subBuses.some((x) => x.key === b.loadBus) ? b.loadBus! : subBuses[0]!.key;
      const target = pair(sub.id, key);
      if (path.has(target)) return { ...b, loadBus: key, cycle: true };
      if (expanded.has(target)) return { ...b, loadBus: key, repeat: true };
      return { ...b, loadBus: key, child: build(sub, key, path) };
    });
    path.delete(me);
    return { equipmentId: e.id, feeds: feeds(e.id), buses: [{ ...bus, breakers }], multiBus: multi.has(e.id), breakers };
  };

  // 펼칠 (설비, 모선) — 이름 순, 모선 차례. 거른 보기에서 보일 차단기가 없는 모선은 세우지 않는다
  // (세웠다가 빼면 다른 가지의 「이미 펼침」이 사라진 뿌리를 가리킨다). 전체 보기의 모선 하나짜리 설비는 빈 채로도 선다.
  const pairs = ordered.flatMap((id) => busesById.get(id)!
    .filter((b) => b.breakers.length > 0 || (filter === 'all' && !multi.has(id)))
    .map((b) => ({ id, bus: b })));
  const visibleFeeds = (b: PowerBus) => b.feeds.filter((f) => visibleBreaker(f.equipmentId, f.circuitNo));

  // 뿌리 = 이 보기에서 보이는 이 국 차단기로부터 받는 입력 전원이 없는 모선.
  // (거르기 'all' 이면 스펙 그대로 「입력 없음 + 모두 국 밖/알 수 없음」. 직류 보기에서 교류로만 받는 충전기는 뿌리가 된다.)
  const roots: PowerNode[] = [];
  for (const p of pairs) {
    if (visibleFeeds(p.bus).length === 0 && !expanded.has(pair(p.id, p.bus.key))) roots.push(build(supply.get(p.id)!, p.bus.key, new Set()));
  }

  // 순환만으로 이어진 무리는 정식 뿌리가 없다 — 남은 (설비, 모선) 가운데 **다른 남은 것에서 받지 않는 무리**의 첫 것을
  // 뿌리로 세운다(남은 것에게서 받기만 하는 꼬리를 뿌리로 세우면 고리가 그 아래로 거꾸로 매달린다).
  const feederOf = (f: PowerFeed) => pair(f.equipmentId, busKeyOf(f.equipmentId, currentOf(f.equipmentId, f.circuitNo)));
  for (;;) {
    const left = pairs.filter((p) => !expanded.has(pair(p.id, p.bus.key)));
    if (left.length === 0) break;
    const leftKeys = new Set(left.map((p) => pair(p.id, p.bus.key)));
    const parents = new Map(left.map((p) => [
      pair(p.id, p.bus.key),
      visibleFeeds(p.bus).map(feederOf).filter((k) => leftKeys.has(k)),
    ]));
    /** k 위로 남은 것들 — 받는 길을 거슬러 닿는 (설비, 모선). */
    const ancestors = (k: string) => {
      const seen = new Set<string>();
      const stack = [...(parents.get(k) ?? [])];
      while (stack.length > 0) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        stack.push(...(parents.get(x) ?? []));
      }
      return seen;
    };
    // 위의 것이 모두 이것을 다시 거쳐 오면(같은 고리) 이 무리는 위에서 받는 것이 없다.
    const pick = left.find((p) => {
      const k = pair(p.id, p.bus.key);
      return [...ancestors(k)].every((a) => a === k || ancestors(a).has(k));
    }) ?? left[0]!;
    roots.push(build(supply.get(pick.id)!, pick.bus.key, new Set()));
  }
  return { roots };
}
