import { useEffect } from 'react';
import { Button, ErrorStrip, useConfirm } from '../../components/ui';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface SaveBarProps {
  onCommit: () => void;
  isCommitting: boolean;
  error?: string | null;
  onClearError?: () => void;
}

export function SaveBar({ onCommit, isCommitting, error, onClearError }: SaveBarProps) {
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
    <div className="shrink-0 flex flex-col border-t border-line bg-surface">
      <ErrorStrip message={error} onDismiss={onClearError} className="border-b border-line px-4 py-1" />
      <div className="flex items-center gap-2 px-4 py-2">
      <span className="flex-1 text-xs text-content-muted">변경 {dirty}건</span>
      <Button variant="ghost" size="sm" onClick={handleUndo}>
        실행 취소
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRedo}>
        다시 실행
      </Button>
      <Button variant="secondary" size="sm" onClick={handleRevert}>
        되돌리기
      </Button>
      <Button size="sm" disabled={isCommitting} onClick={onCommit}>
        {isCommitting ? '저장 중…' : '저장'}
      </Button>
      </div>
      {confirmDialog}
    </div>
  );
}
