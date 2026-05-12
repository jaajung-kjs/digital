import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { RACK_SLOT_COUNT, type RackModule } from '../../../../types/rackModule';
import { EmptySlot } from './EmptySlot';
import { ModuleCell } from './ModuleCell';
import { CategoryComboboxPopover } from './CategoryComboboxPopover';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import { availableSpanAt } from '../../utils/slotGeometry';

interface Props {
  rackEquipmentId: string;
  modules: RackModule[];
}

export function RackSlotGrid({ rackEquipmentId, modules }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const addingAtSlot = useEditorStore((s) => s.addingAtSlot);
  const setAddingAtSlot = useEditorStore((s) => s.setAddingAtSlot);
  const addRackModuleInline = useEditorStore((s) => s.addRackModuleInline);
  const { data: categories } = useRackModuleCategories();

  const anchorRef = useRef<DOMRect | null>(null);

  const handleEmptyClick = (slotIndex: number, anchor: DOMRect) => {
    anchorRef.current = anchor;
    setAddingAtSlot({ rackEquipmentId, slotIndex });
  };

  const handlePick = (catId: string) => {
    if (!addingAtSlot) return;
    const cat = (categories ?? []).find((c) => c.id === catId);
    if (!cat) return;
    const avail = availableSpanAt(modules, addingAtSlot.slotIndex);
    if (avail < 1) {
      setAddingAtSlot(null);
      return;
    }
    const slotSpan = Math.min(cat.defaultSlotSpan, avail);
    addRackModuleInline({
      rackEquipmentId,
      category: cat,
      slotIndex: addingAtSlot.slotIndex,
      slotSpan,
    });
  };

  const occupiedTop = new Map<number, RackModule>();
  const occupiedAny = new Set<number>();
  for (const m of modules) {
    occupiedTop.set(m.slotIndex, m);
    for (let i = m.slotIndex; i < m.slotIndex + m.slotSpan; i++) occupiedAny.add(i);
  }

  return (
    <div className="flex-1 px-2 pb-2 min-h-0">
      <div
        ref={gridRef}
        className="h-full border border-gray-300 rounded-md overflow-hidden bg-white grid gap-1"
        style={{ gridTemplateRows: `repeat(${RACK_SLOT_COUNT}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: RACK_SLOT_COUNT }, (_, i) => {
          if (occupiedTop.has(i)) {
            const m = occupiedTop.get(i)!;
            return (
              <ModuleCell
                key={m.id}
                module={m}
                siblings={modules}
                gridRef={gridRef}
              />
            );
          }
          if (occupiedAny.has(i)) return null;
          return (
            <EmptySlot
              key={`empty-${i}`}
              slotIndex={i}
              onClick={(anchor) => handleEmptyClick(i, anchor)}
            />
          );
        })}
      </div>
      {addingAtSlot && addingAtSlot.rackEquipmentId === rackEquipmentId && anchorRef.current && (
        <CategoryComboboxPopover
          anchorRect={anchorRef.current}
          availableSpan={availableSpanAt(modules, addingAtSlot.slotIndex)}
          onPick={(c) => handlePick(c.id)}
          onCancel={() => setAddingAtSlot(null)}
        />
      )}
    </div>
  );
}
