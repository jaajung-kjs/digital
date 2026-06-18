import { useAsset } from '../hooks/useAsset';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { AssetDetailPanel } from './AssetDetailPanel';

/**
 * 선택된 자산의 staged 상세패널(본부·사업소 — 워킹카피가 SSOT).
 *
 * 현황(NodeStatusView)·선번장 등 여러 진입점이 공유. SSOT 불변식: 모든 편집은 자산이 속한
 * 변전소 working copy 에 stage 돼야 한다(직접 PUT 제거).
 * - 대상 변전소(targetSubstationId)의 working copy 가 로드돼 있으면: 인스펙터는 편집 모드,
 *   자산은 effective(스테이징 반영)에서 해석 → stage 한 편집이 인스펙터·리스트에 즉시 반영.
 * - 로드 직후(effective 비어있음) 동안만 useAsset 페치로 읽기전용 표시(스테이지 불가).
 *
 * initialTab: 처음 활성화할 탭 라벨(예: 선번장은 '연결'). 없으면 첫 탭(기존 동작).
 */
export function StagedAssetDetailPanel({
  assetId,
  targetSubstationId,
  loadedSubstationId,
  onClose,
  initialTab,
}: {
  assetId: string;
  targetSubstationId: string;
  /** 현재 로드된 변전소(=working copy store 의 substationId). */
  loadedSubstationId: string | null;
  onClose: () => void;
  initialTab?: string;
}) {
  const effective = useEffectiveAssets();
  const { data: fetched } = useAsset(assetId);

  // 전역 워킹카피라 변전소 dirty 가드 없음(자산 A는 어디서든 편집 가능 — 종전 차단 분기 제거).
  // 대상 변전소가 아직 로드 안 됨(로딩 중) → useAsset 페치로 읽기전용 표시(스테이지 불가).
  const loaded = loadedSubstationId === targetSubstationId;
  const asset = loaded ? effective.find((a) => a.id === assetId) : undefined;
  const display = asset ?? fetched;
  if (!display) {
    return (
      <aside className="w-[416px] shrink-0 border-l border-line bg-surface h-full overflow-y-auto p-4 text-sm text-content-muted">
        불러오는 중…
      </aside>
    );
  }
  return (
    <AssetDetailPanel
      key={display.id}
      asset={display}
      mode={asset ? 'edit' : 'view'}
      initialTab={initialTab}
      onClose={onClose}
      onPatch={
        asset
          ? (id, patch) => useSubstationWorkingCopy.getState().stageAssetUpdate(id, patch)
          : undefined
      }
    />
  );
}
