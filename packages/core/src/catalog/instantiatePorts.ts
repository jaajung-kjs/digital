import type { AssetTypeSpec, PortRef } from './types.js';

/**
 * 타입의 포트 템플릿에서 자산 인스턴스의 포트 목록을 생성한다. id는 저장 계층이 부여.
 *
 * 같은 타입이라도 실물은 규모가 다르다 — 12심 판과 24심 판이 한 함체에 섞여 있다.
 * 보통 포트는 **개수**가 달라지고(`countOverrides`), 다심 인입은 포트가 하나뿐이라
 * **코어 수**가 달라진다(`positionsOverrides`). 그래서 오버라이드가 둘이다.
 */
export function instantiatePorts(
  spec: AssetTypeSpec,
  assetId: string,
  countOverrides: Partial<Record<string, number>> = {},
  positionsOverrides: Partial<Record<string, number>> = {},
): Omit<PortRef, 'id'>[] {
  return spec.ports.flatMap((tpl) => {
    const count = countOverrides[tpl.group] ?? tpl.count;
    const positions = positionsOverrides[tpl.group] ?? tpl.positions ?? 1;
    return Array.from({ length: count }, (_, i) => ({
      assetId,
      group: tpl.group,
      index: i + 1,
      name: tpl.namePattern.replace('{n}', String(i + 1)),
      direction: tpl.direction,
      medium: tpl.medium,
      positions,
    }));
  });
}
