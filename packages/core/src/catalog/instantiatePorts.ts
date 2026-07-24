import type { AssetTypeSpec, PortRef } from './types.js';

/** 타입의 포트 템플릿에서 자산 인스턴스의 포트 목록을 생성한다. id는 저장 계층이 부여. */
export function instantiatePorts(
  spec: AssetTypeSpec,
  assetId: string,
  countOverrides: Record<string, number> = {},
): Omit<PortRef, 'id'>[] {
  return spec.ports.flatMap((tpl) => {
    const count = countOverrides[tpl.group] ?? tpl.count;
    return Array.from({ length: count }, (_, i) => ({
      assetId,
      group: tpl.group,
      index: i + 1,
      name: tpl.namePattern.replace('{n}', String(i + 1)),
      direction: tpl.direction,
      medium: tpl.medium,
    }));
  });
}
