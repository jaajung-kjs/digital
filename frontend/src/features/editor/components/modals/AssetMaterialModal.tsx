import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Modal, Input, Button } from '../../../../components/ui';

interface AssetMaterialModalProps {
  onAdd: () => void;
}

/**
 * 캔버스에서 설비 사각형을 drag-to-draw 한 뒤 뜨는 이름 입력 모달.
 * 배치할 자산종류는 이미 `newEquipmentType` 에 고정돼 있어 이름만 받는다.
 *
 * UX: autofocused input → Enter → onAdd. ESC/cancel reverts the tool.
 */
export function AssetMaterialModal({ onAdd }: AssetMaterialModalProps) {
  const open = useEditorStore((s) => s.assetModalOpen);
  const setOpen = useEditorStore((s) => s.setAssetModalOpen);
  const newAssetName = useEditorStore((s) => s.newAssetName);
  const setNewAssetName = useEditorStore((s) => s.setNewAssetName);
  const newAssetType = useEditorStore((s) => s.newAssetType);
  const resetNewAssetSelection = useEditorStore(
    (s) => s.resetNewAssetSelection,
  );
  const setTool = useEditorStore((s) => s.setTool);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  const kindLabel = newAssetType?.name ?? '설비';

  const canAdd = newAssetName.trim().length > 0;

  const handleCancel = () => {
    setOpen(false);
    setNewAssetName('');
    resetNewAssetSelection();
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
      size="sm"
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
        value={newAssetName}
        onChange={(e) => setNewAssetName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`예: ${kindLabel}-01`}
      />
      <p className="mt-1 text-xs text-content-faint">Enter 키로 추가</p>
    </Modal>
  );
}
