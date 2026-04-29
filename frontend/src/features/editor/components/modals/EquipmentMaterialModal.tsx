import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { EQUIPMENT_KIND_INFO } from '../../../../types/equipmentKind';

interface EquipmentMaterialModalProps {
  onAdd: () => void;
}

/**
 * P9: name-only modal shown after the user drags out an equipment rectangle on
 * the canvas (kind-driven flow). MaterialPicker / spec inputs / recent list
 * have all been removed — the kind is already pinned on `newEquipmentKind`.
 *
 * UX: autofocused input → Enter → onAdd. ESC/cancel reverts the tool.
 */
export function EquipmentMaterialModal({ onAdd }: EquipmentMaterialModalProps) {
  const open = useEditorStore((s) => s.equipmentModalOpen);
  const setOpen = useEditorStore((s) => s.setEquipmentModalOpen);
  const newEquipmentName = useEditorStore((s) => s.newEquipmentName);
  const setNewEquipmentName = useEditorStore((s) => s.setNewEquipmentName);
  const newEquipmentKind = useEditorStore((s) => s.newEquipmentKind);
  const resetNewEquipmentSelection = useEditorStore(
    (s) => s.resetNewEquipmentSelection,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  if (!open) return null;

  const kindLabel = newEquipmentKind
    ? EQUIPMENT_KIND_INFO[newEquipmentKind].label
    : '설비';

  const canAdd = newEquipmentName.trim().length > 0;

  const handleCancel = () => {
    setOpen(false);
    setNewEquipmentName('');
    resetNewEquipmentSelection();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canAdd) {
      e.preventDefault();
      onAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[360px]">
        <h3 className="text-lg font-semibold mb-4">{kindLabel} 추가</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            이름
          </label>
          <input
            ref={inputRef}
            type="text"
            value={newEquipmentName}
            onChange={(e) => setNewEquipmentName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={`예: ${kindLabel}-01`}
          />
          <p className="mt-1 text-[11px] text-gray-400">Enter 키로 추가</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            취소
          </button>
          <button
            onClick={onAdd}
            disabled={!canAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
