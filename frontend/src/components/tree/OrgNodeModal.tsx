import { useEffect, useRef, useState } from 'react';
import { Modal, Input, Button } from '../ui';
import type { NodeType } from '../../types/organization';

const KOREAN_NOUN: Record<NodeType, string> = {
  headquarters: '본부',
  branch: '지사',
  substation: '변전소',
  floor: '층',
};

export interface OrgNodeModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** add: 생성될 자식 타입; edit: 대상 노드 타입 */
  targetType: NodeType;
  /** edit prefill */
  initialName?: string;
  onSubmit: (values: { name: string; address?: string; floorNumber?: string }) => Promise<void>;
  onClose: () => void;
}

export function OrgNodeModal({
  open,
  mode,
  targetType,
  initialName,
  onSubmit,
  onClose,
}: OrgNodeModalProps) {
  const [name, setName] = useState(initialName ?? '');
  const [address, setAddress] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // open 토글·initialName·targetType 변경 시 로컬 상태 리셋
  useEffect(() => {
    if (open) {
      setName(initialName ?? '');
      setAddress('');
      setFloorNumber('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialName, targetType]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  const showAddress = mode === 'add' && targetType === 'substation';
  const showFloorNumber = mode === 'add' && targetType === 'floor';
  const title = mode === 'add' ? `${KOREAN_NOUN[targetType]} 추가` : '이름 변경';

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        address: address || undefined,
        floorNumber: floorNumber || undefined,
      });
      // 성공 시 부모가 닫는다.
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-[360px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {mode === 'add' ? '추가' : '저장'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-content-muted mb-1">이름</label>
          <Input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleNameKeyDown}
          />
        </div>

        {showAddress && (
          <div>
            <label className="block text-xs text-content-muted mb-1">주소</label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}

        {showFloorNumber && (
          <div>
            <label className="block text-xs text-content-muted mb-1">층번호</label>
            <Input
              type="text"
              value={floorNumber}
              onChange={(e) => setFloorNumber(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-danger text-xs">{error}</p>}
      </div>
    </Modal>
  );
}
