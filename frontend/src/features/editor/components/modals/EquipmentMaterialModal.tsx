import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { EQUIPMENT_KIND_INFO } from '../../../../types/equipmentKind';
import { Modal, Input, Button } from '../../../../components/ui';

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
  const setTool = useEditorStore((s) => s.setTool);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  const kindLabel = newEquipmentKind
    ? EQUIPMENT_KIND_INFO[newEquipmentKind].label
    : '설비';

  const canAdd = newEquipmentName.trim().length > 0;

  const handleCancel = () => {
    setOpen(false);
    setNewEquipmentName('');
    resetNewEquipmentSelection();
    setTool('select');
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
    <Modal
      open={open}
      onClose={handleCancel}
      title={`${kindLabel} 추가`}
      className="max-w-[360px]"
      footer={
        <>
          <Button variant="secondary" onClick={handleCancel}>취소</Button>
          <Button onClick={onAdd} disabled={!canAdd}>추가</Button>
        </>
      }
    >
      <label className="block text-sm font-medium text-content mb-1">이름</label>
      <Input
        ref={inputRef}
        type="text"
        value={newEquipmentName}
        onChange={(e) => setNewEquipmentName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`예: ${kindLabel}-01`}
      />
      <p className="mt-1 text-[11px] text-content-faint">Enter 키로 추가</p>
    </Modal>
  );
}
