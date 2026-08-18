
/**
 * 포트 선언이 어떻게 달라졌는가 — **늘었나, 깨졌나**.
 *
 * 예전에는 「달라졌다/같다」 둘뿐이었다(선언을 통째로 직렬화해 비교). 그래서 자산이 하나라도
 * 있으면 포트를 **한 개도 더할 수 없었다** — 종류를 잘못 등록해 포트 두 개를 더 달아야 하는
 * 흔한 상황에서, 할 수 있는 일이 「자산을 다 지우고 다시 만들기」뿐이었다.
 *
 * 그런데 위험한 것은 **없애는 쪽**이다: 이미 케이블이 물린 포트가 사라지면 그 연결이 갈 곳을
 * 잃는다. 더하는 쪽은 아무것도 건드리지 않는다 — 빈 자리가 늘 뿐이다.
 *
 * 그래서 셋으로 가른다:
 * - `same`     — 선언이 그대로다.
 * - `additive` — 구획이 생겼거나 개수가 늘었다. **사용 중이어도 된다.**
 * - `breaking` — 구획이 사라졌거나 개수가 줄었거나, 이미 있는 포트의 뜻이 바뀌었다
 *                (방향·매체·이름 규칙·심선 수). 사용 중이면 막는다.
 *
 * 심선 수(`positions`)를 늘리는 것도 「늘리기」로 볼 수 있지만 여기서는 깨는 쪽에 둔다 —
 * 그것은 포트가 느는 것이 아니라 **이미 있는 포트 하나의 속이 바뀌는** 일이고, 선번장 값이
 * 코어 번호를 키로 붙어 있다.
 */
export type PortStructureVerdict = 'same' | 'additive' | 'breaking';

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

/** 한 구획에 몇 개를 더 다는가 — 자산에 실제로 포트를 붙일 때 이 값을 쓴다. */
export interface PortAddition {
  group: string;
  /** 더하는 개수. 새 구획이면 그 구획의 전부다. */
  delta: number;
  /** 새로 만들 포트가 따를 선언. */
  template: PortDeclaration;
}

export interface PortStructureDiff {
  verdict: PortStructureVerdict;
  /** `additive` 일 때 무엇을 몇 개 더하는가. 그 밖에는 빈 배열. */
  additions: PortAddition[];
}

/** 이미 있는 포트의 **뜻**이 바뀌었는가 — 이름이 같은 구획인데 다른 것이 된 경우. */
function meaningChanged(before: PortDeclaration, after: PortDeclaration): boolean {
  return (
    before.direction !== after.direction ||
    before.medium !== after.medium ||
    before.namePattern !== after.namePattern ||
    (before.positions ?? 1) !== (after.positions ?? 1)
  );
}

export function comparePortStructure(
  before: readonly PortDeclaration[],
  after: readonly PortDeclaration[],
): PortStructureDiff {
  const beforeByGroup = new Map(before.map((p) => [p.group, p]));
  const afterByGroup = new Map(after.map((p) => [p.group, p]));

  // 사라진 구획 — 그 포트에 물린 케이블이 갈 곳을 잃는다.
  for (const group of beforeByGroup.keys()) {
    if (!afterByGroup.has(group)) return { verdict: 'breaking', additions: [] };
  }

  const additions: PortAddition[] = [];
  for (const next of after) {
    const prev = beforeByGroup.get(next.group);
    if (!prev) {
      additions.push({ group: next.group, delta: next.count, template: next });
      continue;
    }
    if (meaningChanged(prev, next)) return { verdict: 'breaking', additions: [] };
    if (next.count < prev.count) return { verdict: 'breaking', additions: [] };
    if (next.count > prev.count) {
      additions.push({ group: next.group, delta: next.count - prev.count, template: next });
    }
  }

  return { verdict: additions.length > 0 ? 'additive' : 'same', additions };
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
