import { useEditorStore } from '../../stores/editorStore';
import { Modal, Input, Button } from '../../../../components/ui';

interface AssetPasteModalProps {
  onPaste: () => void;
}

/**
 * Modal triggered by Ctrl+V on a copied asset. Asks for a new name
 * before committing the paste via `onPaste`.
 */
export function AssetPasteModal({ onPaste }: AssetPasteModalProps) {
  const open = useEditorStore((s) => s.pasteAssetModalOpen);
  const setOpen = useEditorStore((s) => s.setPasteAssetModalOpen);
  const pasteAssetName = useEditorStore((s) => s.pasteAssetName);
  const setPasteAssetName = useEditorStore((s) => s.setPasteAssetName);

  const handleClose = () => {
    setOpen(false);
    setPasteAssetName('');
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="설비 붙여넣기"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>취소</Button>
          <Button onClick={onPaste} disabled={!pasteAssetName}>붙여넣기</Button>
        </>
      }
    >
      <p className="text-sm text-content-muted mb-3">복사한 설비의 새 이름을 입력하세요.</p>
      <label className="block text-sm font-medium text-content mb-1">설비 이름</label>
      <Input
        type="text"
        value={pasteAssetName}
        onChange={(e) => setPasteAssetName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && pasteAssetName) onPaste(); }}
        placeholder="예: UPS-02"
        autoFocus
      />
    </Modal>
  );
}
