import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { isTempId } from '../../../utils/idHelpers';
import {
  resolveDetailPanel,
  type PanelProps,
} from '../../equipment/components/detail/panels/registry';
import { useMergedEquipmentDetail } from '../../equipment/components/detail/hooks/useEquipmentDetail';
import {
  EQUIPMENT_KIND_INFO,
  type DetailPanelKind,
} from '../../../types/equipmentKind';

interface EquipmentDetailPanelProps extends PanelProps {}

/**
 * P9: detail panel routing now derives from `Equipment.kind` directly —
 * no MaterialCategory lookup. RACK keeps the wider 480px layout to fit the
 * U-slot grid; everything else uses the standard 360px panel.
 */
export function EquipmentDetailPanel({ equipmentId }: EquipmentDetailPanelProps) {
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const focusTick = useEditorStore((s) => s.focusTick);
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);

  // Determine local equipment record (also used by header)
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;
  const localEq = localEquipment.find((e) => e.id === equipmentId);

  const detailKind = useMemo<DetailPanelKind | null>(() => {
    if (!localEq) return null;
    return EQUIPMENT_KIND_INFO[localEq.kind]?.detailPanelKind ?? null;
  }, [localEq]);

  const PanelComponent = useMemo(
    () => (detailKind ? resolveDetailPanel(detailKind) : null),
    [detailKind],
  );

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
      className="absolute right-0 top-0 bottom-0 w-[360px] bg-white border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col"
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
            {!isTemp && isLoading ? '로딩 중...' : equipment?.name ?? '설비 상세'}
          </h3>
          {localEq && (
            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {EQUIPMENT_KIND_INFO[localEq.kind]?.label ?? localEq.kind}
            </span>
          )}
        </div>
        <button
          onClick={() => setDetailPanelEquipmentId(null)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          title="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
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
        {PanelComponent && (
          <PanelComponent
            key={`${equipmentId}-${focusTick}`}
            equipmentId={equipmentId}
          />
        )}
      </div>
    </div>
  );
}
