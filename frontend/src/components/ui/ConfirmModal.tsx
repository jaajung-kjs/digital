import { useId } from 'react';
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
   * 것」**이다. 이름이 없으면 잘못 누른 사람을 못 잡아낸다 — 실제로 「12개 하위 설비가 함께
   * 삭제됩니다」라고만 물어서, 어느 설비를 지우려던 것인지 상자만 보고는 알 수 없었다.
   *
   * 없어도 되는 값으로 두지 않는다. 빠뜨릴 수 있게 두면 빠뜨린다.
   */
  target: string | null;
  /** 본문 — 되돌릴 수 없는 결과(연쇄 삭제 개수 등)를 여기서 구체적으로 밝힌다. */
  message: React.ReactNode;
  /** 확인 버튼 문구. 삭제면 '삭제' 처럼 동사를 쓴다 — '확인' 보다 결과가 분명하다. */
  confirmLabel?: string;
  /** 물리는 단추 문구 — 기본 「취소」. 확인 단추가 이미 「변경 취소」처럼 「취소」를 품으면 겹치지 않게 「계속 편집」 등으로 준다. */
  cancelLabel?: string;
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
 *
 * **묻는 상자는 `alertdialog` 다**(WAI-ARIA APG). 그냥 `dialog` 면 스크린리더는 제목만 읽고
 * 「12개 하위 설비가 함께 삭제됩니다」는 찾아 읽어야 한다 — 경고는 들려야 한다. 그래서 본문을
 * `aria-describedby` 로 가리켜 열리는 즉시 함께 읽히게 한다.
 *
 * **초점은 되돌릴 수 있는 쪽에 선다.** 상자가 뜬 자리에서 Enter 나 Space 는 반사적으로 눌린다 —
 * 지우는 상자에서 그 반사가 삭제가 되면 안 된다(APG: 가장 덜 파괴적인 곳에 초점을 둔다).
 */
export function ConfirmModal({
  open,
  title,
  target,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const bodyId = useId();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      role="alertdialog"
      describedById={bodyId}
      footer={
        <>
          <Button variant="secondary" size="sm" autoFocus={danger} onClick={onClose}>
            {cancelLabel}
          </Button>
          {/* 닫는 책임은 호출부에 있다 — 여기서 onClose 를 함께 부르면
              useConfirm 처럼 확인/취소를 한 경로로 정리하는 쪽에서 이중 호출이 된다. */}
          <Button size="sm" variant={danger ? 'danger' : 'primary'} autoFocus={!danger} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/* 대상을 먼저, 결과를 그다음 — 「무엇을」이 「무슨 일이」보다 앞선다. 둘은 한 덩어리로
          읽혀야 하므로(`aria-describedby`) 같은 자리에 묶는다. */}
      <div id={bodyId}>
        {target !== null && <p className="mb-1 text-sm font-semibold text-content">{target}</p>}
        <div className="text-sm text-content-muted">{message}</div>
      </div>
    </Modal>
  );
}
