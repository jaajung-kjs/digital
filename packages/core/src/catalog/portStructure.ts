import { coreCount } from './portKinds.js';

/**
 * 비교에 쓰는 포트 선언 — DB 행과 요청 바디가 **둘 다** 이 모양이다.
 *
 * `PortTemplate` 을 그대로 쓰지 않는 이유: 그쪽 `direction` 은 좁은 합집합이라 DB 에서 읽은
 * 행(`string`)이 안 들어간다. 여기서 하는 일은 두 선언을 견주는 것뿐이므로 그 폭이면 된다.
 */
export interface PortDeclaration {
  group: string;
  count: number;
  direction: string;
  medium: string;
  namePattern: string;
  positions?: number | null;
  /**
   * 종류 안의 **갈래**(전원의 교류·직류).
   *
   * 여기 없던 동안 `meaningChanged` 가 갈래를 볼 수가 없었다 — 비교할 칸이 아예 없었으니
   * 「빠뜨렸다」기보다 **물어볼 수 없었다.** 형상에 없는 사실은 규칙에도 없다.
   */
  variant?: string | null;
}

/** 한 구획이 몇 개 늘거나 줄었는가 — 자산에 실제로 포트를 붙이고 뗄 때 이 값을 쓴다. */
export interface PortChange {
  group: string;
  /** 늘거나 주는 개수. 구획이 통째로 생기거나 사라지면 그 구획의 전부다. */
  delta: number;
  /** 그 구획의 선언 — 새로 만들 포트가 따른다. 사라지는 구획이면 사라지기 전의 선언이다. */
  template: PortDeclaration;
}

export interface PortStructureDiff {
  /**
   * 이미 있는 포트가 **다른 물건이 되었나** — 방향·매체·이름 규칙·심선 수가 바뀌었다.
   * 개수와 달리 「안 쓰는 것만 골라 처리」할 수가 없다(그 포트가 그대로 남아 뜻만 바뀐다).
   */
  redefined: boolean;
  additions: PortChange[];
  removals: PortChange[];
}

/**
 * 이미 있는 포트의 **뜻**이 바뀌었는가 — 이름이 같은 구획인데 다른 것이 된 경우.
 *
 * **이름은 뜻이 아니다.** 한때 이름 규칙(`namePattern`)이 바뀌면 뜻이 바뀐 것으로 쳐서,
 * 자산이 하나라도 있으면 포트 이름을 고칠 수가 없었다. 그런데 이름을 고쳐도 그 포트는
 * 같은 자리에 있고 물린 케이블도 그대로다 — 부르는 말만 달라진다. 그래서 여기서 뺐고,
 * 대신 이름이 바뀌면 **이미 놓인 포트의 이름도 따라간다**(`catalog.routes` 의 이름 맞춤).
 */
function meaningChanged(before: PortDeclaration, after: PortDeclaration): boolean {
  return (
    before.direction !== after.direction ||
    before.medium !== after.medium ||
    /* **갈래도 뜻이다.** 교류 포트를 직류로 뒤집으면 거기 물린 케이블이 그 순간 규칙 위반이
       된다(`validateConnection` 의 `variant-mismatch`) — 방향을 뒤집는 것과 같은 무게다.
       한동안 여기서 빠져 있었다. 갈래를 고치는 길이 화면에 없어서 사고가 안 났을 뿐,
       API 로는 통과했다. 「지금 부를 수 없다」는 「막을 필요가 없다」가 아니다.

       `?? null` 로 맞추는 까닭: 갈래 없는 포트를 DB 는 `null` 로, 요청 바디는 **적지 않아**
       `undefined` 로 나른다. 그대로 견주면 접지 포트만 있는 종류를 그대로 저장해도
       「뜻이 바뀌었다」가 되어 409 로 튕긴다. */
    (before.variant ?? null) !== (after.variant ?? null) ||
    coreCount(before.positions) !== coreCount(after.positions)
  );
}

/**
 * 포트 선언이 어떻게 달라졌는가 — **무엇이 늘고 무엇이 줄었나**.
 *
 * 예전에는 「달라졌다/같다」 둘뿐이었다(선언을 통째로 직렬화해 비교). 그래서 자산이 하나라도
 * 있으면 포트를 한 개도 더할 수 없었고, 잘못 만든 포트를 **지울 수도** 없었다 — 종류를 잘못
 * 등록하면 할 수 있는 일이 「자산을 다 지우고 다시 만들기」뿐이었다.
 *
 * 여기서 하는 일은 **무엇이 달라졌는지 세는 것뿐**이다. 「해도 되는가」는 세는 것만으로 알 수
 * 없다 — 줄이는 쪽은 사라질 그 포트에 케이블이 물려 있는지를 봐야 하고, 그건 DB 만 안다.
 * 그래서 판정을 여기 넣지 않는다(넣으면 「사용 중이면 무조건 막기」 같은 눈먼 규칙이 된다).
 *
 * 다만 **뜻이 바뀌는 것**(방향·매체·이름 규칙·심선 수)은 개수 문제가 아니라 이미 있는 포트가
 * 다른 물건이 되는 일이라 여기서 표시한다. 심선 수도 여기 둔다 — 포트가 주는 것이 아니라
 * 포트 하나의 속이 바뀌는 일이고, 선번장 값이 코어 번호를 키로 붙어 있다.
 */
export function comparePortStructure(
  before: readonly PortDeclaration[],
  after: readonly PortDeclaration[],
): PortStructureDiff {
  const beforeByGroup = new Map(before.map((p) => [p.group, p]));
  const afterByGroup = new Map(after.map((p) => [p.group, p]));

  const additions: PortChange[] = [];
  const removals: PortChange[] = [];
  let redefined = false;

  // 사라진 구획 — 그 구획이 통째로 준 것이다.
  for (const prev of before) {
    if (!afterByGroup.has(prev.group)) {
      removals.push({ group: prev.group, delta: prev.count, template: prev });
    }
  }

  for (const next of after) {
    const prev = beforeByGroup.get(next.group);
    if (!prev) {
      additions.push({ group: next.group, delta: next.count, template: next });
      continue;
    }
    if (meaningChanged(prev, next)) redefined = true;
    if (next.count > prev.count) {
      additions.push({ group: next.group, delta: next.count - prev.count, template: next });
    } else if (next.count < prev.count) {
      removals.push({ group: next.group, delta: prev.count - next.count, template: prev });
    }
  }

  return { redefined, additions, removals };
}

/**
 * 포트 이름을 짓는 규칙 — `{n}` 자리에 번호가 들어간다.
 *
 * 만들 때(`instantiatePorts`)와 나중에 더 달 때가 같은 이름을 지어야 한다. 두 곳에 적으면
 * 나중에 단 포트만 이름 규칙이 어긋난다.
 */
export function portName(namePattern: string, index: number): string {
  return namePattern.replace('{n}', String(index));
}

/**
 * 사람이 친 이름 → **저장할 이름 규칙**. 번호 자리를 개수에 맞춰 붙이고 뗀다.
 *
 * 사람은 「내부통신」이라고 치지 `내부통신 {n}` 이라고 치지 않는다. 그런데 저장되는 것은
 * 규칙이라, 구획이 셋이면 번호가 붙어야 하고(`내부통신 1·2·3`) 하나면 붙으면 안 된다
 * (「경보 접점 1」은 하나뿐인 것에 번호를 단 이상한 이름이다).
 *
 * **개수가 바뀔 때도 같은 함수가 돈다** — 하나짜리를 셋으로 늘리면 번호가 저절로 붙는다.
 * 두 곳에 적으면 이름을 고칠 때와 개수를 고칠 때가 어긋난다(실제로 그런 자리가 있었다).
 *
 * 친 이름에 `{n}` 이 들어 있으면 **그 자리를 그대로 존중한다** — 「광 {n} 심」처럼 번호가
 * 가운데 오는 이름을 지을 길을 막지 않는다.
 */
export function portNamePattern(typed: string, count: number): string {
  const name = typed.trim();
  if (name === '') return '';
  if (name.includes('{n}')) return name;
  return count > 1 ? `${name} {n}` : name;
}

/** 규칙에서 **사람이 친 이름**만 — 번호 자리를 떼고 다듬는다(고칠 때 상자에 담을 값). */
export function portNameBase(namePattern: string): string {
  return namePattern.replace('{n}', '').replace(/\s+/g, ' ').trim();
}
