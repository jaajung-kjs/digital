import type { PortRef, PortTemplate } from './types.js';
import { portName } from './portStructure.js';
import { coreCount } from './portKinds.js';

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
/**
 * 포트가 생길 때는 **아무 값도 싣지 않는다.**
 *
 * 한때 갈래의 예사 전압을 실었다(`PortVariant.defaultVoltage`) — 「포트가 생기는 순간 이미
 * DC 48V」. 편했지만 그것은 **아무도 확인한 적 없는 값이 자료로 굳는** 일이었다. 옛 대장을
 * 옮길 때 특히 나쁘다: 강릉 조서에는 「220V 3상」까지만 적혀 있고 선식은 없는데, 우리가
 * 「1상2선」을 채워 넣으면 화면이 없는 사실을 말한다.
 *
 * 안 적힌 것은 안 적힌 채로 둔다. 그 자리를 메우는 일은 **읽는 쪽**이 한다 —
 * 회로에 없으면 그 반의 모선에서 물려받는다(`ValueDef.inherited`).
 */
export function instantiatePorts(
  templates: readonly PortTemplate[],
  assetId: string,
  countOverrides: Partial<Record<string, number>> = {},
  positionsOverrides: Partial<Record<string, number>> = {},
): (Omit<PortRef, 'id'> & { fieldValues?: Record<string, unknown> })[] {
  return templates.flatMap((tpl) => {
    const count = countOverrides[tpl.group] ?? tpl.count;
    const positions = positionsOverrides[tpl.group] ?? coreCount(tpl.positions);
    return Array.from({ length: count }, (_, i) => ({
      assetId,
      group: tpl.group,
      index: i + 1,
      name: portName(tpl.namePattern, i + 1),
      direction: tpl.direction,
      medium: tpl.medium,
      positions,
      /* 갈래(전원의 AC·DC)도 포트가 그대로 물려받는다 — 연결 검증이 그것을 본다.
         **없으면 `null` 을 적는다** — 빼면 그 사실이 「모른다」가 되어, 받는 쪽이 갈래
         없는 포트와 구별할 수 없다(`PortRef` 가 이 칸을 필수로 두는 까닭이다). */
      variant: tpl.variant ?? null,
    }));
  });
}
