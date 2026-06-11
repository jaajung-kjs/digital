import { useMemo, type ReactNode } from 'react';
import type { Asset } from '../../../../../types/asset';
import type { DetailPanelKind } from '../../../../../types/equipmentKind';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useAsset } from '../../../../assets/hooks/useAsset';
import { useSelection } from '../../../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../../../workingCopy/hooks';
import { AssetInspector } from '../../../../assets/components/AssetInspector';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';
import { resolveSpatialSection } from './resolveSpatialSection';

interface Props {
  equipmentId: string;
  /** 종류별 공간 섹션 해석용. 없으면 인스펙터만(공간 섹션 없음). */
  kind?: DetailPanelKind | null;
  /** 인스펙터 모드. 변전소=edit(스테이징 편집), 본부·사업소=view(읽기전용). 기본 edit. */
  mode?: 'edit' | 'view';
  /** 편집 stage 를 주입(현황/대장은 자기 store 의 stage 를 넘김). 없고 edit 모드면 내부 stageAssetUpdate. */
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  /** 이미 풀 Asset 을 들고 있는 진입점(현황/대장)은 페치 대신 직접 주입. */
  asset?: Asset | null;
}

/**
 * SSOT 상세 패널 본문 — 모든 진입점(평면도 더블클릭·현황·대장)이 공유하는 단일 본문.
 *
 * = AssetInspector(식별/속성/생애주기/사진/유지보수/연결) + 종류별 공간 섹션
 *   (랙 내부 모듈 GUI / OFD 경로 / 분전반 회로). 종류는 kind 로 받아 resolveSpatialSection
 *   으로 공간 섹션을 해석한다. grounding/hvac 은 공간 섹션이 없어 인스펙터만 나온다.
 *
 * - 비스냅샷·실 id: AssetInspector + 공간 섹션.
 * - 스냅샷: 과거 도면 — 현재 대장 레코드 개념이 없어 BaseEquipmentTabsPanel 폴백(기존 동작).
 * - temp(미저장 신규): asset 없음 → 안내 + (있으면)공간 섹션.
 */
export function AssetDetailBody({ equipmentId, kind, mode = 'edit', onPatch, asset: injected }: Props) {
  const snapshotActive = useSnapshotStore((s) => s.active);

  const spatial = useMemo(
    () => (kind ? resolveSpatialSection(kind, equipmentId) : null),
    [kind, equipmentId],
  );

  // 스냅샷: 기존 탭 패널로 폴백 (과거 도면엔 현재 대장 레코드 개념이 없음).
  if (snapshotActive) {
    if (!spatial) {
      return <BaseEquipmentTabsPanel equipmentId={equipmentId} />;
    }
    const slot = { label: spatial.label, render: () => spatial.node };
    if (spatial.snapshotSlot === 'fourth') {
      return <BaseEquipmentTabsPanel equipmentId={equipmentId} fourthTab={slot} />;
    }
    return (
      <BaseEquipmentTabsPanel equipmentId={equipmentId} defaultTabIndex={4} fifthTab={slot} />
    );
  }

  return (
    <LiveBody
      equipmentId={equipmentId}
      mode={mode}
      onPatch={onPatch}
      injected={injected}
      spatial={spatial?.node}
      spatialLabel={spatial?.label}
    />
  );
}

function LiveBody({
  equipmentId,
  mode,
  onPatch,
  injected,
  spatial,
  spatialLabel,
}: {
  equipmentId: string;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  injected?: Asset | null;
  spatial?: ReactNode;
  spatialLabel?: string;
}) {
  // SSOT: 자산은 *워킹카피(effective)*에서 읽는다 — overlay(스테이징)·저장 후 reload 가 모두
  // 반영된 단일 소스. 서버 useAsset(캐시)로 읽으면 ①저장 후 stale 값으로 되돌아가고(예: 상태
  // ON/OFF), ②미저장 신규(temp)는 서버에 없어 404 → 안내문구가 뜬다. effective 에 있으면
  // 그것을, 없을 때만(다른 변전소·미로드) 서버 페치로 폴백.
  const effective = useEffectiveAssets();
  const fromEffective = useMemo(
    () => (injected ? undefined : effective.find((a) => a.id === equipmentId)),
    [injected, effective, equipmentId],
  );
  const fetched = useAsset(injected || fromEffective ? undefined : equipmentId);
  const asset = injected ?? fromEffective ?? fetched.data;
  const isLoading = injected || fromEffective ? false : fetched.isLoading;
  const sel = useSelection();
  const stageAssetUpdate = useSubstationWorkingCopy((s) => s.stageAssetUpdate);
  const today = useMemo(() => new Date(), []);

  // edit 모드면 onPatch 주입(없으면 통합 WC stage), view 모드면 undefined.
  const patch =
    mode === 'edit' ? (onPatch ?? ((id: string, p: Partial<Asset>) => stageAssetUpdate(id, p))) : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {asset ? (
        // 공간 섹션(실장도 등)은 정보 탭 안으로 — AssetInspector 가 spatial 을 받아 렌더.
        <AssetInspector
          asset={asset}
          mode={mode}
          onPatch={patch}
          onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
          spatial={spatial}
          spatialLabel={spatialLabel}
          today={today}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-content-faint">대장 정보를 불러올 수 없습니다.</p>
      )}
    </div>
  );
}
