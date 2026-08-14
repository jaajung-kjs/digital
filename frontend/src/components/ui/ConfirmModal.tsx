import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /**
   * **무엇을** 두고 묻는가 — 그 하나의 이름. 대상이 없는 물음(「저장하지 않은 변경」 같은)
   * 이면 `null` 을 준다.
   *
   * 물어보는 상자의 존재 이유는 「멈추는 것」이 아니라 **「내가 맞는 걸 눌렀는지 확인시키는
   * 것」**이다. 이름이 없으면 잘못 누른 사람을 못 잡아낸다 — 실제로 「12개 하위 자산이 함께
   * 삭제됩니다」라고만 물어서, 어느 설비를 지우려던 것인지 상자만 보고는 알 수 없었다.
   *
   * 없어도 되는 값으로 두지 않는다. 빠뜨릴 수 있게 두면 빠뜨린다.
   */
  target: string | null;
  /** 본문 — 되돌릴 수 없는 결과(연쇄 삭제 개수 등)를 여기서 구체적으로 밝힌다. */
  message: React.ReactNode;
  /** 확인 버튼 문구. 삭제면 '삭제' 처럼 동사를 쓴다 — '확인' 보다 결과가 분명하다. */
  confirmLabel?: string;
  /** 파괴적 동작이면 true — 확인 버튼이 위험 색을 쓴다. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 확인 대화상자 — `window.confirm` 대체.
 *
 * 네이티브 confirm 은 (a) 앱과 생김새가 다르고 (b) 브라우저 전체를 막고
 * (c) 강조·서식이 불가능해 "N개가 함께 삭제됩니다" 같은 결과를 눈에 띄게 알릴 수 없다.
 * 여기서는 공용 Modal 을 써서 나머지 화면과 같은 언어로 묻는다.
 */
export function ConfirmModal({
  open,
  title,
  target,
  message,
  confirmLabel = '확인',
  danger,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
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
          {/* 닫는 책임은 호출부에 있다 — 여기서 onClose 를 함께 부르면
              useConfirm 처럼 확인/취소를 한 경로로 정리하는 쪽에서 이중 호출이 된다. */}
          <Button size="sm" variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/* 대상을 먼저, 결과를 그다음 — 「무엇을」이 「무슨 일이」보다 앞선다. */}
      {target !== null && <p className="mb-1 text-sm font-semibold text-content">{target}</p>}
      <div className="text-sm text-content-muted">{message}</div>
    </Modal>
  );
}
