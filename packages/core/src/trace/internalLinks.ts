import type { InternalLinkRule, PortRef } from '../catalog/types.js';

/**
 * 한 자산 **안에서** 서로 이어진 포트 쌍 — "이 장비를 신호가 어떻게 통과하는가".
 *
 * 링크 규칙(`links`)은 타입 명세가 선언하는 capability 중 하나인데, 지금까지 화면 어디에도
 * 나타나지 않아 무엇을 위해 정의했는지 확인할 방법이 없었다. 추적 엔진은 이 짝을 그래프의
 * `internal` 간선으로 쓰고, 상세 화면은 포트마다 "내부로 어디와 이어지는지" 를 보여준다 —
 * 계산이 두 곳으로 갈라지지 않도록 여기 한 번만 둔다.
 *
 * - `byIndex`: 같은 번호끼리 (A1↔B1, A2↔B2) — 광 성단/선로처럼 코어가 1:1 대응할 때
 * - `all`: 양쪽 그룹의 모든 포트가 서로 (IN 아무거나 ↔ OUT 아무거나) — 분전반 모선처럼
 *
 * @returns portId → 내부로 이어진 portId 목록 (양방향으로 채워진다)
 */
export function internalLinkMap(
  links: readonly InternalLinkRule[],
  ports: readonly PortRef[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
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
