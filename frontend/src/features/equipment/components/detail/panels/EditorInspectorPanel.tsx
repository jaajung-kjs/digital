import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { isTempId } from '../../../../../utils/idHelpers';
import { useAsset } from '../../../../assets/hooks/useAsset';
import { useSelection } from '../../../../workspace/SelectionContext';
import { useWorkspaceNav } from '../../../../workspace/WorkspaceNavContext';
import { registerUrl } from '../../../../assets/navUrls';
import { AssetInspector } from '../../../../assets/components/AssetInspector';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface Props {
  equipmentId: string;
  /** 이 종류의 공간(spatial) 섹션 — 랙뷰 / OFD 경로 / 분전반 회로. 없으면 인스펙터만. */
  spatial?: ReactNode;
  /** 공간 섹션 라벨 (스냅샷 탭 / 비스냅샷 섹션 헤더). */
  spatialLabel?: string;
  /** 스냅샷 폴백 시 공간 섹션을 4번째('연결' 대체) 탭에 넣을지 5번째 탭에 추가할지.
   *  OFD 는 기존에 fourth(경로), RACK/DIST 는 fifth 였다 — 기존 동작 보존용. */
  snapshotSlot?: 'fourth' | 'fifth';
}

/**
 * INS-T3: 에디터 우측 상세 패널 = AssetInspector(view) + 공간 섹션.
 *
 * - 비스냅샷·실 id: useAsset 으로 대장 레코드를 읽어 AssetInspector(view) 로
 *   식별/속성/생애주기/사진/유지보수/연결을 읽기전용 표시. 그 아래 공간 섹션.
 * - 스냅샷: 과거 도면 — 현재 자산이 없으므로 AssetInspector 를 띄우지 않고
 *   기존 BaseEquipmentTabsPanel(사진/정보/점검 + 공간 탭)로 폴백해 기존 동작 보존.
 * - temp(미저장 신규): useAsset 비활성 → asset 없음. 공간 섹션만(또는 안내).
 */
export function EditorInspectorPanel({
  equipmentId,
  spatial,
  spatialLabel,
  snapshotSlot = 'fifth',
}: Props) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);

  // 스냅샷: 기존 탭 패널로 폴백 (과거 도면엔 현재 대장 레코드 개념이 없음).
  if (snapshotActive) {
    if (!spatial) {
      return <BaseEquipmentTabsPanel equipmentId={equipmentId} />;
    }
    const slot = { label: spatialLabel ?? '공간', render: () => spatial };
    if (snapshotSlot === 'fourth') {
      return <BaseEquipmentTabsPanel equipmentId={equipmentId} fourthTab={slot} />;
    }
    return (
      <BaseEquipmentTabsPanel
        equipmentId={equipmentId}
        defaultTabIndex={4}
        fifthTab={slot}
      />
    );
  }

  return (
    <LiveInspectorPanel
      equipmentId={equipmentId}
      isTemp={isTemp}
      spatial={spatial}
      spatialLabel={spatialLabel}
    />
  );
}

function LiveInspectorPanel({
  equipmentId,
  isTemp,
  spatial,
  spatialLabel,
}: {
  equipmentId: string;
  isTemp: boolean;
  spatial?: ReactNode;
  spatialLabel?: string;
}) {
  const { data: asset, isLoading } = useAsset(equipmentId);
  const sel = useSelection();
  const ws = useWorkspaceNav();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {asset ? (
        <AssetInspector
          asset={asset}
          mode="view"
          onSelectAsset={(id) => sel?.setSelectedAssetId(id)}
          onGotoRegister={(id) =>
            ws ? ws.gotoRegister(id) : navigate(registerUrl(asset.substationId, id))
          }
          today={today}
        />
      ) : isTemp ? (
        <p className="px-4 py-3 text-xs text-gray-400">
          아직 저장되지 않은 설비입니다. 도면을 저장하면 대장 정보가 표시됩니다.
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-gray-400">대장 정보를 불러올 수 없습니다.</p>
      )}

      {spatial && (
        <section className="px-4 py-3 border-t border-gray-100">
          {spatialLabel && (
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{spatialLabel}</h3>
          )}
          {spatial}
        </section>
      )}
    </div>
  );
}
