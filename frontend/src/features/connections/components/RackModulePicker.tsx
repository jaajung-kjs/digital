import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { RACK_SLOT_COUNT } from '../../../types/rackModule';
import { useEffectiveRackModules } from '../../workingCopy/hooks';

interface RackModulePickerProps {
  rackEquipmentId: string;
  rackName?: string;
  /**
   * Module endpoint chosen — moduleId is null when the user opted to use
   * the rack itself as the endpoint instead of a specific module.
   */
  onSelect: (moduleId: string) => void;
  onCancel: () => void;
}

/**
 * P9: rack module picker shown during cable drawing when the source/target is
 * a RACK. Reads modules from the editor's working copy (`localRackModules`)
 * so unsaved tempIds resolve correctly. The grid mirrors the slot layout in
 * RackView but each populated slot is a click target — empty slots are
 * read-only.
 *
 * Mirrors the slot-picker pattern used for OFD endpoints (P7: FiberPortGrid removed).
 */
export function RackModulePicker({
  rackEquipmentId,
  rackName,
  onSelect,
  onCancel,
}: RackModulePickerProps) {
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로. effectiveRackModulesMapped 는
  // 이미 해당 랙(rackEquipmentId)의 모듈만 RackModule shape 으로 반환한다.
  const rackModules = useEffectiveRackModules(rackEquipmentId);

  const modules = useMemo(
    () => [...rackModules].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)),
    [rackModules],
  );

  /**
   * Map slot index → owning module (for rendering). slotIndex 0 is the top
   * slot, RACK_SLOT_COUNT-1 is the bottom — identical to RackSlotGrid.
   */
  const slotMap = useMemo(() => {
    const map = new Map<number, (typeof modules)[number]>();
    for (const m of modules) {
      const start = m.slotIndex ?? 0;
      const span = m.slotSpan ?? 1;
      for (let i = start; i < start + span; i++) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
      <div className="bg-surface rounded-lg shadow-xl w-[420px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-content">
              랙 모듈 선택
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              {rackName ? `${rackName} — ` : ''}연결할 모듈을 클릭하세요
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 text-content-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="닫기 (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[11px] text-content-faint mb-1">전면 뷰</div>
          <div className="border border-line rounded">
            {Array.from({ length: RACK_SLOT_COUNT }, (_, slotIdx) => {
              const mod = slotMap.get(slotIdx);
              if (mod) {
                // Only render at the first (top) slot of the module.
                if (slotIdx !== (mod.slotIndex ?? 0)) return null;
                const color = mod.assetType?.displayColor ?? '#6b7280';
                const modStart = mod.slotIndex ?? 0;
                const modSpan = mod.slotSpan ?? 1;
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    onClick={() => onSelect(mod.id)}
                    className="w-full flex cursor-pointer hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    style={{ height: `${modSpan * 22}px` }}
                    title={`${mod.name} (슬롯 ${modStart}~${modStart + modSpan - 1})`}
                  >
                    <div className="w-9 flex items-center justify-center text-[10px] text-content-faint border-r border-line bg-surface-2 shrink-0">
                      {slotIdx + 1}
                    </div>
                    <div
                      className="flex-1 flex items-center justify-center text-xs font-medium text-white border-b border-line px-1 truncate"
                      style={{ backgroundColor: color }}
                    >
                      {mod.name}
                    </div>
                  </button>
                );
              }
              return (
                <div key={slotIdx} className="flex" style={{ height: '22px' }}>
                  <div className="w-9 flex items-center justify-center text-[10px] text-content-faint border-r border-line bg-surface-2 shrink-0">
                    {slotIdx + 1}
                  </div>
                  <div className="flex-1 border-b border-line bg-surface" />
                </div>
              );
            })}
          </div>

          {modules.length === 0 && (
            <p className="mt-3 text-xs text-content-faint text-center">
              이 랙에는 모듈이 없습니다 — 랙 본체에 연결하세요.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line shrink-0 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-content-muted hover:bg-surface-2 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
