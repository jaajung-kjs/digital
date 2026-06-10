import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEffectiveAssets, useEffectiveEquipment } from '../../workingCopy/hooks';
import { isTempId } from '../../../utils/idHelpers';
import { AssetDetailBody } from '../../equipment/components/detail/panels/AssetDetailBody';
import { useMergedEquipmentDetail } from '../../equipment/components/detail/hooks/useEquipmentDetail';
import {
  EQUIPMENT_KIND_INFO,
  type DetailPanelKind,
} from '../../../types/equipmentKind';

interface EquipmentDetailPanelProps {
  equipmentId: string;
  /** SSOT-2d Task 3 — effective 설비 조회용 (header 의 kind/name lookup). */
  floorId: string;
}

/**
 * P9: detail panel routing now derives from `Equipment.kind` directly —
 * no MaterialCategory lookup. RACK keeps the wider 480px layout to fit the
 * U-slot grid; everything else uses the standard 360px panel.
 */
export function EquipmentDetailPanel({ equipmentId, floorId }: EquipmentDetailPanelProps) {
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const focusTick = useEditorStore((s) => s.focusTick);
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);

  // Determine equipment record (also used by header).
  // SSOT-2d Task 3 — 비스냅샷 경로는 통합 스토어 effective 에서 읽는다.
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const effectiveEquipment = useEffectiveEquipment(floorId);
  const localEquipment = snapshotActive ? snapshotEquipment : effectiveEquipment;
  const localEq = localEquipment.find((e) => e.id === equipmentId);

  // 랙 모듈은 평면도에 배치되지 않아 effectiveEquipment(floor) 에 없다.
  // 그 경우 전역 effective assets 에서 모듈 Asset(parentAssetId 있음)을 찾아
  // 같은 통합 본문(AssetDetailBody)에 주입한다. 모듈은 leaf 라 공간 섹션 없음(kind=null).
  const effectiveAssets = useEffectiveAssets();
  const moduleAsset = useMemo(
    () =>
      !localEq && !snapshotActive
        ? (effectiveAssets.find((a) => a.id === equipmentId && a.parentAssetId != null) ?? null)
        : null,
    [localEq, snapshotActive, effectiveAssets, equipmentId],
  );

  const detailKind = useMemo<DetailPanelKind | null>(() => {
    if (moduleAsset) return null; // 모듈은 내부설비/경로 같은 공간 섹션이 없음
    if (!localEq) return null;
    return EQUIPMENT_KIND_INFO[localEq.kind]?.detailPanelKind ?? null;
  }, [moduleAsset, localEq]);

  // I35: ESC to close panel (when no modal/lightbox is open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const overlays = document.querySelectorAll('[class*="fixed inset-0"]');
        if (overlays.length > 0) return;
        setDetailPanelEquipmentId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setDetailPanelEquipmentId]);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-96 bg-surface border-l border-line shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate">
            {moduleAsset
              ? moduleAsset.name
              : !isTemp && isLoading
                ? '로딩 중...'
                : equipment?.name ?? '설비 상세'}
          </h3>
          {moduleAsset ? (
            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {moduleAsset.assetType?.name ?? '모듈'}
            </span>
          ) : localEq ? (
            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {EQUIPMENT_KIND_INFO[localEq.kind]?.label ?? localEq.kind}
            </span>
          ) : null}
        </div>
        <button
          onClick={() => setDetailPanelEquipmentId(null)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          title="닫기"
        >
          <X size={16} />
        </button>
      </div>

      {/* Snapshot read-only banner */}
      {snapshotActive && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 font-medium text-center shrink-0">
          과거 도면 보기 중 (읽기 전용)
        </div>
      )}

      {/* Body — delegated to resolved panel.
          key 로 equipmentId+focusTick 을 묶어 다른 설비로 전환하거나 같은 설비를
          재더블클릭할 때 패널 서브트리 전체를 remount. 탭/편집 폼/라이트박스 같은
          내부 useState 들이 직전 설비의 잔여 상태를 끌고 오지 않게 한다. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AssetDetailBody
          key={`${equipmentId}-${focusTick}`}
          equipmentId={equipmentId}
          kind={detailKind}
          asset={moduleAsset}
        />
      </div>
    </div>
  );
}
