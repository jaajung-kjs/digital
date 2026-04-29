import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useMaterialCategories } from '../../materials/hooks/useMaterialCategories';
import { isTempId } from '../../../utils/idHelpers';
import {
  resolveDetailPanel,
  type PanelProps,
} from '../../equipment/components/detail/panels/registry';
import { useMergedEquipmentDetail } from '../../equipment/components/detail/panels/GenericEquipmentPanel';
import type { DetailPanelKind, MaterialCategory } from '../../../types/material';

interface EquipmentDetailPanelProps extends PanelProps {}

/**
 * Flatten a parents-only `by-type` response (with nested `children`) into one
 * lookup-friendly map of MaterialCategory by id.
 */
function flattenMaterialCategories(
  list: MaterialCategory[] | undefined,
): Map<string, MaterialCategory> {
  const map = new Map<string, MaterialCategory>();
  if (!list) return map;
  for (const parent of list) {
    map.set(parent.id, parent);
    for (const child of parent.children ?? []) {
      map.set(child.id, child);
    }
  }
  return map;
}

export function EquipmentDetailPanel({ equipmentId, floorId }: EquipmentDetailPanelProps) {
  const setDetailPanelEquipmentId = useEditorStore((s) => s.setDetailPanelEquipmentId);
  const snapshotActive = useSnapshotStore((s) => s.active);
  const isTemp = isTempId(equipmentId);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);

  // Determine local equipment record (also used by header)
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const editorEquipment = useEditorStore((s) => s.localEquipment);
  const localEquipment = snapshotActive ? snapshotEquipment : editorEquipment;
  const localEq = localEquipment.find((e) => e.id === equipmentId);

  // Resolve detail panel kind via MaterialCategory metadata
  const { data: equipmentCats } = useMaterialCategories('EQUIPMENT');
  const catKind = useMemo<DetailPanelKind | null>(() => {
    const map = flattenMaterialCategories(equipmentCats);
    const cat = localEq?.materialCategoryId ? map.get(localEq.materialCategoryId) : undefined;
    if (cat?.detailPanelKind) return cat.detailPanelKind;
    // Fallback: rack via legacy code prefix
    if (localEq?.materialCategoryCode?.startsWith('EQP-RACK')) return 'rack';
    return null;
  }, [equipmentCats, localEq?.materialCategoryId, localEq?.materialCategoryCode]);

  const PanelComponent = useMemo(() => resolveDetailPanel(catKind), [catKind]);
  const isRackPanel = catKind === 'rack';

  // Parent rack — for back button
  const parentEquipmentId = localEq?.parentEquipmentId ?? null;

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
      className={`absolute right-0 top-0 bottom-0 bg-white border-l border-gray-200 shadow-[-4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col ${
        isRackPanel ? 'w-[480px]' : 'w-[360px]'
      }`}
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
          {parentEquipmentId && (
            <button
              onClick={() => setDetailPanelEquipmentId(parentEquipmentId)}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              title="랙으로 돌아가기"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h3 className="text-sm font-bold text-gray-900 truncate">
            {!isTemp && isLoading ? '로딩 중...' : equipment?.name ?? '설비 상세'}
          </h3>
          {equipment && (
            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              {localEq?.materialCategoryName ?? localEq?.materialCategoryCode ?? '-'}
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

      {/* Body — delegated to resolved panel */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PanelComponent equipmentId={equipmentId} floorId={floorId} />
      </div>
    </div>
  );
}
