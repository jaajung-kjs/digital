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
