import { Modal, Button } from '../../../components/ui';

interface MaterialSelectionModalProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled: boolean;
  children: React.ReactNode;
  selectedLabel?: string | null;
}

export function MaterialSelectionModal({
  title,
  onConfirm,
  onCancel,
  confirmDisabled,
  children,
  selectedLabel,
}: MaterialSelectionModalProps) {
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button onClick={onConfirm} disabled={confirmDisabled}>확인</Button>
        </>
      }
    >
      <div>{children}</div>
      {selectedLabel && (
        <div className="mt-4 p-2 bg-info-bg rounded">
          <p className="text-sm text-primary">선택: {selectedLabel}</p>
        </div>
      )}
    </Modal>
  );
}
