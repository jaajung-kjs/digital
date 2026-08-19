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

/** 이미 있는 포트의 **뜻**이 바뀌었는가 — 이름이 같은 구획인데 다른 것이 된 경우. */
function meaningChanged(before: PortDeclaration, after: PortDeclaration): boolean {
  return (
    before.direction !== after.direction ||
    before.medium !== after.medium ||
    before.namePattern !== after.namePattern ||
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
