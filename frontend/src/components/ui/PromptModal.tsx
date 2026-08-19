import { useEffect, useState } from 'react';
import { Button } from './Button';
import { ErrorStrip } from './ErrorStrip';
import { Input } from './Input';
import { isCommitKey } from './keyboard';
import { Modal } from './Modal';

interface PromptModalProps {
  open: boolean;
  title: string;
  /** 입력 위 설명 — 이름 규칙처럼 알아야 할 제약을 여기 적는다. */
  hint?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 진행 중이면 확인 버튼이 잠긴다(중복 제출 방지). */
  busy?: boolean;
  /** 서버/검증 오류 문구 — 모달을 닫지 않고 그 자리에 보여준다. */
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/**
 * 한 줄 입력 대화상자 — `window.prompt` 대체.
 *
 * 네이티브 prompt 는 (a) 입력 규칙을 안내할 수 없고 (b) **검증 실패를 그 자리에서
 * 보여줄 수 없으며**(닫히고 나면 사용자는 무엇이 잘못됐는지 모른다) (c) 스타일링과
 * 테스트가 불가능하다. 분류·케이블 품목 추가는 이 시스템의 핵심 자유도인데 그 진입점이
 * 브라우저 기본 프롬프트였다.
 *
 * 빈 값이면 확인이 잠긴다 — 빈 이름 제출로 서버 400 을 받는 왕복을 없앤다.
 */
export function PromptModal({
  open,
  title,
  hint,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = '추가',
  busy,
  error,
  onConfirm,
  onClose,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue);

  // 열릴 때마다 초기값으로 되돌린다 — 직전 입력이 남아 있으면 안 된다.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const canConfirm = value.trim() !== '' && !busy;

  function submit() {
    if (!canConfirm) return;
    onConfirm(value.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" disabled={!canConfirm} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {hint && <p className="text-xs text-content-muted">{hint}</p>}
        <label className="block space-y-1">
          <span className="text-xs text-content-muted">{label}</span>
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (isCommitKey(e)) submit();
            }}
          />
        </label>
        <ErrorStrip message={error} />
      </div>
    </Modal>
  );
}
