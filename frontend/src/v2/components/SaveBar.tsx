import { useEffect, useRef } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { useStore } from 'zustand';
import { Button, IconButton, isTypingTarget, useConfirm } from '../../components/ui';
import { useWorkingCopy, workingCopyStore } from '../model/store/workingCopy';

interface SaveBarProps {
  onCommit: () => void;
  isCommitting: boolean;
  /** 변경이 닿은 국 이름 — 「북춘천S/S·춘천H/P」. */
  substationNames: string[];
  /** 저장을 막는 첫 흠 문구 — 있으면 저장 단추가 잠기고 문구가 뜬다. */
  issue: string | null;
}

/** 이 자판에서 「실행 취소」는 무엇으로 누르나 — 맥은 ⌘, 나머지는 Ctrl. */
const MOD = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/**
 * 저장 손잡이 — **캔버스 머리줄 안에 선다**(대장 편집 바와 같은 자리).
 *
 * 예전에는 화면 하단에 따로 떠오르는 바였다. 그래서 같은 「저장」이 화면마다 다른 자리에
 * 있었고(대장은 위, 설비 관리는 아래), 저장하려면 시선이 아래로 갔다가 다시 올라와야
 * 했다. 왼쪽이 「지금 무엇을 고치고 있나」, 오른쪽이 「그것을 어떻게 할 것인가」다.
 *
 * **손잡이는 숨기지 않는다.** 한동안 실행 취소·다시 실행·되돌리기 셋을 `⋯` 안에 넣어
 * 두었는데, 앞의 둘은 고치는 내내 쓰는 것이라 두 번 눌러야 닿는 자리에 있을 것이 아니다.
 * 되돌리기도 겉으로 내되 **글자 단추**로 둔다 — 아이콘만 두면 무엇인지 모른 채 누르기 쉽고,
 * 이건 4건을 통째로 버리는 일이다(확인 상자는 그래서 남는다).
 *
 * 바가 서는 조건은 「고칠 것이 있거나, **되돌아갈 수 있을 때**」다. 예전에는 고친 것이 없으면
 * 무조건 사라졌는데, 그러면 ⌘Z 로 전부 물린 순간 바가 사라져 **다시 실행할 길이 없어졌다**.
 */
export function SaveBar({ onCommit, isCommitting, substationNames, issue }: SaveBarProps) {
  const { confirm, confirmDialog } = useConfirm();
  // 반응형 dirty count — 스토어 파생 getter 구독 (primitive 반환, 재렌더 안전)
  const dirty = useWorkingCopy((s) => s.dirtyCount());
  /* 되돌아갈 수 있나 — 시간 여행 스토어를 따로 구독한다(값이 아니라 개수만 본다). */
  const canUndo = useStore(workingCopyStore.temporal, (t) => t.pastStates.length > 0);
  const canRedo = useStore(workingCopyStore.temporal, (t) => t.futureStates.length > 0);

  /* 탭을 닫을 때 묻는 일은 여기서 하지 않는다 — 그 자리는 셸 하나다(`V2Shell`).
     화면이 하는 일은 「안 저장된 것이 몇 건」인지 손을 드는 것뿐이고(`useUnsavedMark`),
     막는 일은 셸이 한다. 여기에도 같은 등록을 두면 화면마다 빠뜨릴 자리가 생기고,
     품목 탭들은 셸의 것만으로 이미 물어보고 있다. */

  /**
   * ⌘Z · ⇧⌘Z — **자판으로도 물린다.**
   *
   * 단추만 두면 고치는 손이 매번 마우스로 옮겨 간다. 글자를 치는 중이면 가로채지 않는다:
   * 그때 ⌘Z 는 그 칸에서 방금 친 글자를 물리는 것이지 자산 배치를 물리는 것이 아니다
   * (`isTypingTarget` — Esc 와 같은 규칙).
   */
  /* 저장 중에는 물리지 않는다 — 보낸 본문과 화면이 갈라진다(판도 잠겨 있다, `BusyOverlay`). */
  const committing = useRef(isCommitting);
  committing.current = isCommitting;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey)) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (committing.current) return;
      const t = workingCopyStore.temporal.getState();
      if (e.shiftKey) t.redo();
      else t.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (dirty === 0 && !canRedo) return null;

  async function handleRevert() {
    if (!(await confirm({ title: '변경 되돌리기', target: null, message: `저장하지 않은 변경 ${dirty}건이 모두 사라집니다.`, confirmLabel: '되돌리기', danger: true }))) return;
    workingCopyStore.getState().revert();
  }

  return (
    <>
      <span className="shrink-0 text-xs text-content-muted">
        변경 {dirty}건{substationNames.length > 0 && ` · ${substationNames.join('·')}`}
      </span>
      {issue && <span className="min-w-0 truncate text-xs text-danger" role="alert">{issue}</span>}
      <IconButton
        aria-label="실행 취소"
        title={`실행 취소 (${MOD}Z)`}
        size="sm"
        disabled={!canUndo || isCommitting}
        disabledReason={isCommitting ? '저장 중입니다' : '되돌릴 것이 없습니다'}
        onClick={() => workingCopyStore.temporal.getState().undo()}
      >
        <Undo2 size={14} />
      </IconButton>
      <IconButton
        aria-label="다시 실행"
        title={`다시 실행 (⇧${MOD}Z)`}
        size="sm"
        disabled={!canRedo || isCommitting}
        disabledReason={isCommitting ? '저장 중입니다' : '다시 실행할 것이 없습니다'}
        onClick={() => workingCopyStore.temporal.getState().redo()}
      >
        <Redo2 size={14} />
      </IconButton>
      {/* 저장과 되돌리기는 **고친 것이 있을 때만** 뜻이 있다 — 전부 물린 뒤에는 저장할 것도
          버릴 것도 없다(그때 바에 남는 것은 다시 실행뿐이다). */}
      {dirty > 0 && (
        <>
          <Button variant="secondary" size="sm" disabled={isCommitting} onClick={() => void handleRevert()}>
            되돌리기
          </Button>
          <Button size="sm" disabled={isCommitting || issue != null} onClick={onCommit}>
            {isCommitting ? '저장 중…' : '저장'}
          </Button>
        </>
      )}
      {confirmDialog}
    </>
  );
}
