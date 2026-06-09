import { useEditorStore } from '../../stores/editorStore';
import { Modal, Input, Button } from '../../../../components/ui';

interface EquipmentPasteModalProps {
  onPaste: () => void;
}

/**
 * Modal triggered by Ctrl+V on a copied equipment. Asks for a new name
 * before committing the paste via `onPaste`.
 */
export function EquipmentPasteModal({ onPaste }: EquipmentPasteModalProps) {
  const open = useEditorStore((s) => s.pasteEquipmentModalOpen);
  const setOpen = useEditorStore((s) => s.setPasteEquipmentModalOpen);
  const pasteEquipmentName = useEditorStore((s) => s.pasteEquipmentName);
  const setPasteEquipmentName = useEditorStore((s) => s.setPasteEquipmentName);

  const handleClose = () => {
    setOpen(false);
    setPasteEquipmentName('');
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="설비 붙여넣기"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>취소</Button>
          <Button onClick={onPaste} disabled={!pasteEquipmentName}>붙여넣기</Button>
        </>
      }
    >
      <p className="text-sm text-content-muted mb-3">복사한 설비의 새 이름을 입력하세요.</p>
      <label className="block text-sm font-medium text-content mb-1">설비 이름</label>
      <Input
        type="text"
        value={pasteEquipmentName}
        onChange={(e) => setPasteEquipmentName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && pasteEquipmentName) onPaste(); }}
        placeholder="예: UPS-02"
        autoFocus
      />
    </Modal>
  );
}
