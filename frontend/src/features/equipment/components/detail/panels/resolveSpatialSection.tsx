import type { ReactNode } from 'react';
import type { DetailPanelKind } from '../../../../../types/equipmentKind';
import { RackInternal } from './RackEquipmentPanel';
import { OfdPathsView } from './OfdEquipmentPanel';
import { DistributionCircuits } from './DistributionPanel';

export interface SpatialSection {
  /** 섹션 헤더 라벨. */
  label: string;
  /** 인스펙터 아래에 붙는 종류별 공간 GUI. */
  node: ReactNode;
}

/**
 * 자산 종류(DetailPanelKind) → 상세 패널의 공간(spatial) 섹션.
 *
 * 평면도 더블클릭(에디터)·현황·대장 어디서든 동일한 GUI 를 노출하기 위한 단일 레지스트리.
 * 모든 노드는 working-copy 기반(useSubstationWorkingCopy / effective hooks)이라 캔버스
 * 밖(현황·대장)에서도 그대로 렌더된다. grounding/hvac 은 공간 섹션이 없어 null.
 */
export function resolveSpatialSection(
  kind: DetailPanelKind,
  equipmentId: string,
): SpatialSection | null {
  switch (kind) {
    case 'rack':
      return {
        label: '내부 설비',
        node: <RackInternal equipmentId={equipmentId} />,
      };
    case 'ofd':
      return {
        label: '경로',
        node: <OfdPathsView equipmentId={equipmentId} />,
      };
    case 'distribution':
      return {
        label: '회로',
        node: <DistributionCircuits equipmentId={equipmentId} />,
      };
    case 'grounding':
    case 'hvac':
      return null;
  }
}
