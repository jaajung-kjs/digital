import { useEffect } from 'react';
import { Button, OverflowMenu, useConfirm } from '../../components/ui';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface SaveBarProps {
  onCommit: () => void;
  isCommitting: boolean;
}

/**
 * 저장 손잡이 — **캔버스 머리줄 안에 선다**(대장 편집 바와 같은 자리).
 *
 * 예전에는 화면 하단에 따로 떠오르는 바였다. 그래서 같은 「저장」이 화면마다 다른 자리에
 * 있었고(대장은 위, 워크스페이스는 아래), 저장하려면 시선이 아래로 갔다가 다시 올라와야
 * 했다. 왼쪽이 「지금 무엇을 고치고 있나」, 오른쪽이 「그것을 어떻게 할 것인가」다.
 *
 * 되돌릴 수 있는 것은 겉에(저장), 되돌릴 수 없는 것과 드물게 쓰는 것은 `⋯` 안에
 * (되돌리기·실행 취소·다시 실행) — 트리·대장과 같은 규칙이다.
 *
 * 고친 것이 없으면 아무것도 그리지 않는다. 다만 **탭 닫기 경고는 그때도 걸어 둔다** —
 * 훅은 이른 반환보다 먼저 선다.
 */
export function SaveBar({ onCommit, isCommitting }: SaveBarProps) {
  const { confirm, confirmDialog } = useConfirm();
  // 반응형 dirty count — 스토어 파생 getter 구독 (primitive 반환, 재렌더 안전)
  const dirty = useV2WorkingCopy((s) => s.dirtyCount());

  /**
   * 탭을 닫거나 주소를 갈아탈 때 **브라우저가 한 번 묻게** 한다.
   *
   * 앱 안에서 화면을 옮길 때는 이미 확인 상자가 뜨는데, 정작 탭을 닫으면 아무 말 없이
   * 사라졌다 — 사람이 실수하는 가장 흔한 자리가 그쪽이다. 브라우저가 띄우는 문구는
   * 우리가 정할 수 없다(스팸 방지); 우리가 하는 일은 「물어봐 달라」고 표시하는 것뿐이다.
   */
  useEffect(() => {
    if (dirty === 0) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  if (dirty === 0) return null;

  async function handleRevert() {
    if (!(await confirm({ title: '변경 되돌리기', target: null, message: `저장하지 않은 변경 ${dirty}건이 모두 사라집니다.`, confirmLabel: '되돌리기', danger: true }))) return;
    useV2WorkingCopy.getState().revert();
  }

  function handleUndo() {
    useV2WorkingCopy.temporal.getState().undo();
  }

  function handleRedo() {
    useV2WorkingCopy.temporal.getState().redo();
  }

  return (
    <>
      <span className="shrink-0 text-xs text-content-muted">변경 {dirty}건</span>
      <OverflowMenu
        label="변경 더 보기"
        items={[
          { label: '실행 취소', onSelect: handleUndo },
          { label: '다시 실행', onSelect: handleRedo },
          { label: '변경 되돌리기', danger: true, onSelect: () => void handleRevert() },
        ]}
      />
      <Button size="sm" disabled={isCommitting} onClick={onCommit}>
        {isCommitting ? '저장 중…' : '저장'}
      </Button>
      {confirmDialog}
    </>
  );
}
