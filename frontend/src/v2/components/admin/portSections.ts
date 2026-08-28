import type { ReactNode } from 'react';
import { comparePortGroups, coreCount, groupRefOfTemplate, instantiatePorts, portGroupLabel } from '@twin/core';
import type { Direction } from '@twin/core';
import type { V2Port } from '../../types';

/** 판을 그리는 데 필요한 최소 — 짜는 중인 초안이든 이미 저장된 종류의 템플릿이든 맞는다. */
export interface PreviewPort {
  group: string;
  count: number;
  direction: Direction;
  medium: string;
  namePattern: string;
  positions?: number | null;
  /** 종류 안의 갈래(전원의 AC·DC) — 이름이 그것으로 갈린다. */
  variant?: string | null;
  /** 이름 괄호에 실리는 값 — 「전원 출력(DC 48V)」. */
  voltage?: string | null;
}

export interface PortSection {
  key: string;
  label: ReactNode;
  /** 라벨을 글자로만 — 편집기가 그 자리에 칸을 끼워 넣을 때 쓴다. */
  labelText: string;
  accent: string | null;
  medium: string;
  positions: number;
  ports: V2Port[];
}

/**
 * 포트 선언 → 판의 구획들.
 *
 * 포트를 만드는 일은 `instantiatePorts` 한 곳이 한다 — 자산을 놓을 때와 **같은 문**이다.
 * 그래야 여기서 본 판이 놓고 나서도 같다. 차례도 `comparePortGroups` 한 함수가 정한다.
 *
 * 편집기와 미리보기가 이 함수를 함께 쓴다 — 둘이 각자 만들면 「미리보기」가 아니라 다른
 * 그림이 된다.
 */
export function portSections(
  source: readonly PreviewPort[],
  mediumLabel: (key: string) => string,
  mediumColor: (key: string) => string | null,
  /**
   * 이름 괄호에 값을 실을 것인가 — 「전원 출력(DC 48V)」.
   *
   * 미리보기는 싣는다(놓고 나면 그 이름으로 보이므로). **편집기는 싣지 않는다** — 그 값을
   * 이름표의 칩으로 따로 고치므로 같은 말이 두 번 서기 때문이다.
   */
  withDetail = true,
): PortSection[] {
  const ports: V2Port[] = instantiatePorts(
    source.map((p, i) => ({
      id: `t${i}`,
      group: p.group,
      count: p.count,
      direction: p.direction,
      medium: p.medium,
      namePattern: p.namePattern,
      sortOrder: i,
      positions: coreCount(p.positions),
    })),
    'preview',
  ).map((p, i) => ({ ...p, id: `pv-${i}`, positions: coreCount(p.positions), fieldValues: {} }));

  const byGroup = new Map<string, V2Port[]>();
  for (const p of ports) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);

  /* 개수가 0 인 선언도 구획으로 남긴다 — 편집기에서 「없는 종류」도 한 자리를 지켜야
     칸을 켜고 끌 때 판이 출렁이지 않는다. 그때는 `instantiatePorts` 가 포트를 하나도
     만들지 않으므로 선언에서 직접 짓는다. */
  const refs = source.map((p) => {
    const ref = groupRefOfTemplate(p);
    return withDetail ? ref : { ...ref, detail: null };
  });

  return refs
    .slice()
    .sort(comparePortGroups)
    .map((ref) => {
      const label = portGroupLabel(ref, refs, mediumLabel);
      return {
        key: ref.group,
        label,
        labelText: label,
        accent: mediumColor(ref.medium),
        medium: ref.medium,
        positions: coreCount(ref.positions),
        ports: byGroup.get(ref.group) ?? [],
      };
    });
}
