import { useMemo, type ReactNode } from 'react';
import type { Asset } from '../../../../../types/asset';
import type { DetailPanelKind } from '../../../../../types/equipmentKind';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { isTempId } from '../../../../../utils/idHelpers';
import { useAsset } from '../../../../assets/hooks/useAsset';
import { useSelection } from '../../../../workspace/SelectionContext';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
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
  const isTemp = isTempId(equipmentId);

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
      isTemp={isTemp}
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
  isTemp,
  mode,
  onPatch,
  injected,
  spatial,
  spatialLabel,
}: {
  equipmentId: string;
  isTemp: boolean;
  mode: 'edit' | 'view';
  onPatch?: (id: string, patch: Partial<Asset>) => void;
  injected?: Asset | null;
  spatial?: ReactNode;
  spatialLabel?: string;
}) {
  // 현황/대장은 풀 Asset 을 주입(injected) → 페치 생략. 에디터는 useAsset 으로 대장 레코드를 읽는다.
  const fetched = useAsset(injected ? undefined : equipmentId);
  const asset = injected ?? fetched.data;
  const isLoading = injected ? false : fetched.isLoading;
  const sel = useSelection();
  const stageAssetUpdate = useSubstationWorkingCopy((s) => s.stageAssetUpdate);
  const today = useMemo(() => new Date(), []);

  // edit 모드면 onPatch 주입(없으면 통합 WC stage), view 모드면 undefined.
  const patch =
    mode === 'edit' ? (onPatch ?? ((id: string, p: Partial<Asset>) => stageAssetUpdate(id, p))) : undefined;

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {asset ? (
        <AssetInspector
          asset={asset}
          mode={mode}
          onPatch={patch}
          onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
          today={today}
        />
      ) : isTemp ? (
        <p className="px-4 py-3 text-xs text-content-faint">
          아직 저장되지 않은 설비입니다. 도면을 저장하면 대장 정보가 표시됩니다.
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-content-faint">대장 정보를 불러올 수 없습니다.</p>
      )}

      {spatial && (
        // 공간 섹션 헤더 톤을 보조 섹션(CollapsibleSection) 헤더와 일치(text-xs font-semibold).
        <section className="px-4 py-2 border-t border-line">
          {spatialLabel && (
            <h3 className="text-xs font-semibold text-content-muted mb-2">{spatialLabel}</h3>
          )}
          {spatial}
        </section>
      )}
    </div>
  );
}
