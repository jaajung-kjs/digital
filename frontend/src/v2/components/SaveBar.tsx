import { Button } from '../../components/ui';
import { overlayDirtyCount } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface SaveBarProps {
  onCommit: () => void;
  isCommitting: boolean;
}

export function SaveBar({ onCommit, isCommitting }: SaveBarProps) {
  // 반응형 dirty count — overlays 슬라이스 구독
  const overlays = useV2WorkingCopy((s) => s.overlays);
  const dirty = overlayDirtyCount(overlays.assets) + overlayDirtyCount(overlays.maintenance) + overlayDirtyCount(overlays.inspections);

  if (dirty === 0) return null;

  function handleRevert() {
    if (!window.confirm(`변경 ${dirty}건을 모두 되돌리시겠습니까?`)) return;
    useV2WorkingCopy.getState().revert();
  }

  function handleUndo() {
    useV2WorkingCopy.temporal.getState().undo();
  }

  function handleRedo() {
    useV2WorkingCopy.temporal.getState().redo();
  }

  return (
    <div className="shrink-0 flex items-center gap-2 border-t border-line bg-surface px-4 py-2">
      <span className="flex-1 text-xs text-content-muted">변경 {dirty}건</span>
      <Button variant="ghost" size="sm" onClick={handleUndo}>
        되돌리기(U)
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRedo}>
        다시실행(R)
      </Button>
      <Button variant="secondary" size="sm" onClick={handleRevert}>
        되돌리기
      </Button>
      <Button size="sm" disabled={isCommitting} onClick={onCommit}>
        {isCommitting ? '저장 중…' : '저장'}
      </Button>
    </div>
  );
}
