import { portKind } from '../catalog/portKinds.js';
import type { Direction, InternalLinkRule, PortRef } from '../catalog/types.js';

/**
 * 링크 규칙을 유도하는 데 필요한 최소 정보 — 포트 인스턴스(`PortRef`)와 포트 템플릿이 둘 다 맞는다.
 * 그래서 관리자 화면(템플릿)과 추적 엔진(인스턴스)이 같은 함수로 같은 답을 얻는다.
 */
export interface LinkablePort {
  group: string;
  medium: string;
  direction: Direction;
  positions?: number;
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 포트 선언만 보고 **저절로 정해지는** 내부 연결.
 *
 * 예전에는 이 규칙들을 시드에 손으로 적어 두었다. 전원 입력과 출력을 따로 선언해 놓고
 * 그 둘이 이어진다는 사실을 또 적는 것은 같은 말의 되풀이라, 실제로 축전지 하나만 빠져
 * 있어도 아무도 알아채지 못했다(그래서 빠져 있었다). 선언에서 나오는 것은 유도한다.
 *
 * 유도되는 것은 둘뿐이다:
 *
 * - **방향이 뜻을 갖는 종류**(전원): 입력 그룹과 출력 그룹은 서로 통한다. 기기 안에서
 *   들어온 전원이 나가지 않는 경우는 없다 — 그래서 방향을 나눠 선언한 것이다.
 * - **다심 인입**: 인입 포트의 코어 i 는 앞면 i 번 포트로 나온다(`expandsTo`).
 *   앞면 후보가 둘 이상이면 어느 쪽인지 알 수 없으므로 유도하지 않는다 — 그때는 선언한다.
 *
 * 그 밖의 내부 연결(한 함체 안 모듈 사이의 버스 같은 것)은 포트 선언에서 나오지 않으므로
 * 사용자가 직접 적는다. 유도와 선언은 더해진다 — 유도가 선언을 지우지 않는다.
 */
export function derivedLinks(ports: readonly LinkablePort[]): InternalLinkRule[] {
  const groups = new Map<string, LinkablePort>();
  for (const p of ports) if (!groups.has(p.group)) groups.set(p.group, p);
  const all = [...groups.values()];

  const rules: InternalLinkRule[] = [];
  const seen = new Set<string>();
  const add = (fromGroup: string, toGroup: string, mapping: InternalLinkRule['mapping']) => {
    if (fromGroup === toGroup || seen.has(key(fromGroup, toGroup))) return;
    seen.add(key(fromGroup, toGroup));
    rules.push({ fromGroup, toGroup, mapping });
  };

  for (const from of all) {
    const kind = portKind(from.medium);
    if (kind == null) continue;

    // 전원처럼 공급/소비가 갈리는 종류 — 입력 그룹 하나하나가 모든 출력 그룹과 통한다.
    if (kind.pairing === 'opposite' && from.direction === 'IN') {
      for (const to of all) {
        if (to.medium === from.medium && to.direction === 'OUT') add(from.group, to.group, 'all');
      }
    }

    // 다심 인입 — 코어 번호로 앞면에 펼쳐진다.
    if (kind.multiCore && kind.expandsTo) {
      const front = all.filter((t) => t.medium === kind.expandsTo);
      if (front.length === 1) add(from.group, front[0]!.group, 'byPosition');
    }
  }
  return rules;
}

/**
 * 한 자산 **안에서** 서로 이어진 포트 쌍 — "이 장비를 신호가 어떻게 통과하는가".
 *
 * 규칙은 두 갈래에서 온다: 포트 선언에서 저절로 나오는 것(`derivedLinks`)과, 나오지 않아
 * 사용자가 적은 것(`declared`). 한 함체 안에 모듈이 여럿 들어가고 그 사이 버스가 제각각인
 * 경우(PITR 같은)는 포트 종류만으로 표현할 수 없어서 뒤쪽이 필요하다.
 *
 * 추적 엔진은 이 짝을 그래프의 `internal` 간선으로 쓰고, 상세 화면은 포트마다 "내부로
 * 어디와 이어지는지" 를 보여 준다 — 계산이 두 곳으로 갈라지지 않도록 여기 한 번만 둔다.
 *
 * - `byIndex`: 같은 번호끼리 (A1↔B1, A2↔B2)
 * - `byPosition`: 다심 포트 하나가 자기 코어 수만큼의 앞면 포트와 (인입↔심선)
 * - `all`: 양쪽 그룹의 모든 포트가 서로 (IN 아무거나 ↔ OUT 아무거나) — 모선처럼
 *
 * @returns portId → 내부로 이어진 portId 목록 (양방향으로 채워진다)
 */
export function internalLinkMap(
  declared: readonly InternalLinkRule[],
  ports: readonly PortRef[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  const declaredPairs = new Set(declared.map((l) => key(l.fromGroup, l.toGroup)));
  const links = [
    ...declared,
    // 사용자가 같은 짝을 이미 적었으면 그쪽이 남는다 — 유도가 선언을 덮어쓰지 않는다.
    ...derivedLinks(ports).filter((l) => !declaredPairs.has(key(l.fromGroup, l.toGroup))),
  ];
  if (links.length === 0) return result;

  const byGroup = new Map<string, PortRef[]>();
  for (const p of ports) {
    const list = byGroup.get(p.group);
    if (list) list.push(p);
    else byGroup.set(p.group, [p]);
  }

  const pair = (a: string, b: string) => {
    const list = result.get(a);
    if (list) {
      if (!list.includes(b)) list.push(b);
    } else {
      result.set(a, [b]);
    }
  };

  for (const rule of links) {
    const from = byGroup.get(rule.fromGroup) ?? [];
    const to = byGroup.get(rule.toGroup) ?? [];
    if (rule.mapping === 'byIndex') {
      const toByIndex = new Map(to.map((p) => [p.index, p]));
      for (const f of from) {
        const t = toByIndex.get(f.index);
        if (!t) continue;
        pair(f.id, t.id);
        pair(t.id, f.id);
      }
    } else if (rule.mapping === 'byPosition') {
      /* 인입 포트 하나가 자기 코어 수만큼만 앞면과 이어진다. 앞면 포트가 더 많아도
         (24심 인입 옆의 48구 판) 없는 코어까지 이어졌다고 하면 안 된다. */
      for (const f of from) {
        const cores = f.positions ?? 1;
        for (const t of to) {
          if (t.index > cores) continue;
          pair(f.id, t.id);
          pair(t.id, f.id);
        }
      }
    } else {
      for (const f of from) {
        for (const t of to) {
          pair(f.id, t.id);
          pair(t.id, f.id);
        }
      }
    }
  }
  return result;
}
