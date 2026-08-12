/**
 * PortsPreview — 짜는 중인 포트가 **실제로 어떤 판이 되는지**.
 *
 * 자산 상세가 쓰는 것과 **같은 `PortFaceplate`** 를 쓴다. 미리보기를 따로 그리면 그게
 * 미리보기가 아니라 다른 그림이 된다 — 여기서 24구로 보이던 것이 놓고 나면 달라 보이면
 * 미리 볼 뜻이 없다.
 *
 * 포트를 만드는 일도 `instantiatePorts` 한 곳이 한다(자산을 놓을 때와 같은 문). 이름이
 * 어떻게 붙고 번호가 어디서 시작하는지가 여기서 바로 보인다.
 */
import { useMemo } from 'react';
import { comparePortGroups, instantiatePorts, portGroupLabel } from '@twin/core';
import { DetailCard, DetailCardHeader, EmptyState } from '../../../components/ui';
import { useMediumColor, useMediumLabel } from '../../hooks';
import type { V2Port } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';

export function PortsPreview({ draft }: { draft: TypeDraft }) {
  const mediumColor = useMediumColor();
  const mediumLabel = useMediumLabel();

  const sections = useMemo(() => {
    /* 미리보기용 포트 — id 는 자리만 채운다(누를 것이 없으므로 충돌도 없다).
       `positions ?? 1` 로 좁혀 두는 이유: 판은 다심을 그림으로 가른다. */
    const ports: V2Port[] = instantiatePorts(
      draft.ports.map((p, i) => ({
        id: `t${i}`,
        group: p.group,
        count: p.count,
        direction: p.direction,
        medium: p.medium,
        namePattern: p.namePattern,
        sortOrder: i,
        positions: p.positions ?? 1,
      })),
      'preview',
    ).map((p, i) => ({ ...p, id: `pv-${i}`, positions: p.positions ?? 1, fieldValues: {} }));

    const byGroup = new Map<string, V2Port[]>();
    for (const p of ports) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);

    const refs = [...byGroup.entries()].map(([group, list]) => ({
      group, medium: list[0]!.medium, direction: list[0]!.direction,
      sampleName: list[0]!.name, positions: list[0]!.positions,
    }));
    // 차례도 자산 상세와 **같은 함수**로 — 여기서만 다르게 서면 미리 볼 뜻이 없다.
    return refs
      .slice()
      .sort(comparePortGroups)
      .map((ref) => ({
        key: ref.group,
        label: portGroupLabel(ref, refs, mediumLabel),
        accent: mediumColor(ref.medium),
        ports: byGroup.get(ref.group)!,
      }));
  }, [draft.ports, mediumColor, mediumLabel]);

  const total = sections.reduce((n, s) => n + s.ports.length, 0);

  return (
    <DetailCard>
      <DetailCardHeader title="판 미리보기" badge={`포트 ${total}`} badgeStatus="neutral" />
      {sections.length === 0 ? (
        <EmptyState title="포트가 없습니다" description="왼쪽에서 포트 종류를 더하면 판이 여기 나타납니다." className="py-6" />
      ) : (
        <PortFaceplate
          sections={sections}
          /* 미리보기에는 연결이 없다 — 전부 빈 자리로 그린다. 색이 다 차 있으면 「이미 물려
             있는 판」으로 읽혀서, 정작 봐야 할 자리·번호가 안 보인다. */
          stateOf={() => 'empty'}
          cableCountOf={() => 0}
          selectedPortId={null}
          onSelect={() => {}}
        />
      )}
    </DetailCard>
  );
}
