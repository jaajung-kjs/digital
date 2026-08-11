import type { PortRef, PortTemplate } from './types.js';

/**
 * 포트 템플릿에서 자산 인스턴스의 포트 목록을 만든다. id 는 부르는 쪽이 붙인다.
 *
 * **화면과 서버가 같은 함수를 부른다.** 예전에는 서버만 불러서, 저장하기 전에는 포트가
 * 아예 없었다 — 그래서 상세 패널의 포트 탭이 사라지고, 선번장·계통에도 안 나타나고,
 * 케이블을 이을 수도 없었다(포트가 없으니). 워킹카피는 「저장하면 이렇게 된다」인데
 * 포트만 그 그림에서 빠져 있었다.
 *
 * 같은 타입이라도 실물은 규모가 다르다 — 12심 판과 24심 판이 한 함체에 섞여 있다.
 * 보통 포트는 **개수**가 달라지고(`countOverrides`), 다심 인입은 포트가 하나뿐이라
 * **코어 수**가 달라진다(`positionsOverrides`). 그래서 오버라이드가 둘이다.
 */
export function instantiatePorts(
  templates: readonly PortTemplate[],
  assetId: string,
  countOverrides: Partial<Record<string, number>> = {},
  positionsOverrides: Partial<Record<string, number>> = {},
): Omit<PortRef, 'id'>[] {
  return templates.flatMap((tpl) => {
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
