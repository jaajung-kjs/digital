import { useMemo } from 'react';
import { DetailCard, DetailCardHeader, EmptyState } from '../../../components/ui';
import { useMediumColor, useMediumLabel } from '../../hooks';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections, type PreviewPort } from './portSections';

export type { PreviewPort };

export function PortsPreview({
  ports: source,
  title = '판 미리보기',
  empty = '이 자산 종류에는 포트가 선언돼 있지 않습니다.',
}: {
  ports: readonly PreviewPort[];
  title?: string;
  empty?: string;
}) {
  const mediumColor = useMediumColor();
  const mediumLabel = useMediumLabel();
  const sections = useMemo(
    // 편집기와 **같은 함수**로 만든다 — 각자 만들면 「미리보기」가 아니라 다른 그림이 된다.
    () => portSections(source, mediumLabel, mediumColor).filter((s) => s.ports.length > 0),
    [source, mediumLabel, mediumColor],
  );

  const total = sections.reduce((n, s) => n + s.ports.length, 0);

  return (
    <DetailCard>
      <DetailCardHeader title={title} badge={`포트 ${total}`} badgeStatus="neutral" />
      {sections.length === 0 ? (
        <EmptyState title="포트가 없습니다" description={empty} className="py-6" />
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
