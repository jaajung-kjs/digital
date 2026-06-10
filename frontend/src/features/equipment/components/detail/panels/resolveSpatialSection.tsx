import type { ReactNode } from 'react';
import type { DetailPanelKind } from '../../../../../types/equipmentKind';
import { RackInternal } from './RackEquipmentPanel';
import { OfdPathsView } from './OfdEquipmentPanel';
import { DistributionCircuits } from './DistributionPanel';

export interface SpatialSection {
  /** 섹션 헤더 / 스냅샷 탭 라벨. */
  label: string;
  /** 비스냅샷 인스펙터 아래에 붙는 종류별 공간 GUI. */
  node: ReactNode;
  /** 스냅샷 폴백 시 공간 섹션을 4번째('연결' 대체) 탭에 넣을지 5번째에 추가할지.
   *  OFD 는 fourth(경로), RACK/DIST 는 fifth — 기존 동작 보존. */
  snapshotSlot: 'fourth' | 'fifth';
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
        snapshotSlot: 'fifth',
      };
    case 'ofd':
      return {
        label: '경로',
        node: <OfdPathsView equipmentId={equipmentId} />,
        snapshotSlot: 'fourth',
      };
    case 'distribution':
      return {
        label: '회로',
        node: <DistributionCircuits equipmentId={equipmentId} />,
        snapshotSlot: 'fifth',
      };
    case 'grounding':
    case 'hvac':
      return null;
  }
}

/** rack 은 U-슬롯 그리드 때문에 더 넓은 패널이 필요. */
export function spatialNeedsWidePanel(kind: DetailPanelKind | null): boolean {
  return kind === 'rack';
}
