import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import type { ModuleSlotUpdate, RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

export function ModuleCell({ module, siblings, gridRef }: Props) {
  const setSelectedRackModuleId = useEditorStore((s) => s.setSelectedRackModuleId);
  const updateRackModule = useEditorStore((s) => s.updateRackModule);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const onCommit = (updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  };

  const { handlePointerDown, handlePointerMove, handlePointerUp, livePlan } = useSlotDrag({
    module,
    siblings,
    gridRef,
    onClick: () => setSelectedRackModuleId(module.id),
    onCommit,
  });

  const color = module.categoryDisplayColor ?? '#6b7280';
  const dragging = livePlan != null;
  const rejected = livePlan?.rejected === true;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        gridRow: `span ${module.slotSpan}`,
        backgroundColor: rejected ? '#ef4444' : color,
        opacity: dragging ? 0.7 : 1,
      }}
      className={`relative flex items-center px-2 text-white text-xs font-medium rounded select-none cursor-grab hover:brightness-110 transition-all overflow-hidden min-h-0 ${
        rejected ? 'animate-pulse' : ''
      }`}
      title={`${module.name} (슬롯 ${module.slotIndex}~${module.slotIndex + module.slotSpan - 1}) — 클릭=편집, 드래그=이동, 하단 핸들=리사이즈`}
    >
      <span className="truncate flex-1">{module.name}</span>
      {module.categoryName && (
        <span className="text-[10px] opacity-80 ml-1.5 shrink-0">{module.categoryName}</span>
      )}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          handlePointerDown(e, 'resize');
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/20 hover:bg-white/50 cursor-ns-resize"
        title="드래그해서 크기 조절"
      />
    </div>
  );
}
