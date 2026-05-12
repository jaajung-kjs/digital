import { useEffect, useMemo } from 'react';
import { RACK_SLOT_COUNT } from '../../../types/rackModule';
import { useEditorStore } from '../../editor/stores/editorStore';

interface RackModulePickerProps {
  rackEquipmentId: string;
  rackName?: string;
  /**
   * Module endpoint chosen — moduleId is null when the user opted to use
   * the rack itself as the endpoint instead of a specific module.
   */
  onSelect: (moduleId: string | null) => void;
  onCancel: () => void;
}

/**
 * P9: rack module picker shown during cable drawing when the source/target is
 * a RACK. Reads modules from the editor's working copy (`localRackModules`)
 * so unsaved tempIds resolve correctly. The grid mirrors the slot layout in
 * RackView but each populated slot is a click target — empty slots are
 * read-only.
 *
 * Symmetric to FiberPortGrid (used for OFD endpoints).
 */
export function RackModulePicker({
  rackEquipmentId,
  rackName,
  onSelect,
  onCancel,
}: RackModulePickerProps) {
  const localRackModules = useEditorStore((s) => s.localRackModules);

  const modules = useMemo(
    () =>
      localRackModules
        .filter((m) => m.rackEquipmentId === rackEquipmentId)
        .sort((a, b) => a.slotIndex - b.slotIndex),
    [localRackModules, rackEquipmentId],
  );

  /**
   * Map slot index → owning module (for rendering). slotIndex 0 is the top
   * slot, RACK_SLOT_COUNT-1 is the bottom — identical to RackSlotGrid.
   */
  const slotMap = useMemo(() => {
    const map = new Map<number, (typeof modules)[number]>();
    for (const m of modules) {
      for (let i = m.slotIndex; i < m.slotIndex + m.slotSpan; i++) {
        map.set(i, m);
      }
    }
    return map;
  }, [modules]);

  // ESC closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[420px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              랙 모듈 선택
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {rackName ? `${rackName} — ` : ''}연결할 모듈을 클릭하세요
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="닫기 (ESC)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2 mb-3 rounded border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            title="모듈을 지정하지 않고 랙 자체를 끝점으로 사용합니다."
          >
            <span className="font-medium">랙 본체에 연결</span>
            <span className="ml-2 text-xs text-gray-400">(모듈 미지정)</span>
          </button>

          <div className="text-[11px] text-gray-400 mb-1">전면 뷰</div>
          <div className="border border-gray-300 rounded">
            {Array.from({ length: RACK_SLOT_COUNT }, (_, slotIdx) => {
              const mod = slotMap.get(slotIdx);
              if (mod) {
                // Only render at the first (top) slot of the module.
                if (slotIdx !== mod.slotIndex) return null;
                const color = mod.categoryDisplayColor ?? '#6b7280';
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    onClick={() => onSelect(mod.id)}
                    className="w-full flex cursor-pointer hover:brightness-110 transition-all"
                    style={{ height: `${mod.slotSpan * 22}px` }}
                    title={`${mod.name} (슬롯 ${mod.slotIndex + 1}–${mod.slotIndex + mod.slotSpan})`}
                  >
                    <div className="w-9 flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-200 bg-gray-50 shrink-0">
                      {slotIdx + 1}
                    </div>
                    <div
                      className="flex-1 flex items-center justify-center text-xs font-medium text-white border-b border-gray-200 px-1 truncate"
                      style={{ backgroundColor: color }}
                    >
                      {mod.name}
                    </div>
                  </button>
                );
              }
              return (
                <div key={slotIdx} className="flex" style={{ height: '22px' }}>
                  <div className="w-9 flex items-center justify-center text-[10px] text-gray-300 border-r border-gray-200 bg-gray-50 shrink-0">
                    {slotIdx + 1}
                  </div>
                  <div className="flex-1 border-b border-gray-100 bg-white" />
                </div>
              );
            })}
          </div>

          {modules.length === 0 && (
            <p className="mt-3 text-xs text-gray-400 text-center">
              이 랙에는 모듈이 없습니다 — 랙 본체에 연결하세요.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t shrink-0 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
