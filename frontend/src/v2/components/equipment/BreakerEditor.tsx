import { useEffect, useState } from 'react';
import { MAX_CIRCUITS } from '@twin/core';
import { Button, ErrorStrip, Modal } from '../../../components/ui';
import { removeLastCircuit } from '../../model/store/deleteActions';
import { CircuitTable } from './CircuitTable';

interface Props {
  equipmentId: string;
  equipmentName: string;
  /** 지금 차단기 수 — 끝에 닿으면 더하기·지우기를 끈다. */
  count: number;
  open: boolean;
  /** 표시할 차단기 — 요약 줄을 눌렀거나 방금 더한 줄. 없으면 표만 연다. */
  focusNo: number | null;
  onAdd: () => void;
  onClose: () => void;
}

/**
 * 차단기 편집 창 — 9열 표는 **넓은 대화상자 안에서만** 선다(364px 패널에 두면 글자가 세로로 쪼개진다).
 *
 * 차단기는 수로만 생긴다: 더하기는 끝에 한 줄, 지우기는 끝 번호 한 줄(단추에 번호를 적는다). 지우려는 차단기에 연결이 남아 있으면
 * 아무것도 바꾸지 않고 그 자리에서 까닭을 말한다(§1.7-f).
 */
export function BreakerEditor({ equipmentId, equipmentName, count, open, focusNo, onAdd, onClose }: Props) {
  const [blocked, setBlocked] = useState<string | null>(null);
  /* 닫히면 까닭도 걷는다 — 다시 열었을 때 지난 일이 남아 있으면 지금 막힌 것처럼 읽힌다. */
  useEffect(() => { if (!open) setBlocked(null); }, [open]);

  return (
    <Modal
      open={open} onClose={onClose} title={`차단기 — ${equipmentName}`} size="xl"
      /* 더하기·지우기는 바닥 띠에 — 표가 길어도(스무 줄) 굴리지 않고 닿는다. 까닭도 그 옆에 뜬다. */
      footer={(
        <>
          <Button variant="secondary" disabled={count >= MAX_CIRCUITS} onClick={() => { setBlocked(null); onAdd(); }}>차단기 추가</Button>
          {/* 지우는 것이 **몇 번**인지 이름에 적는다 — 「마지막」은 표를 끝까지 굴려 봐야 안다. 되돌릴 수 있어 묻지 않는다. */}
          <Button
            variant="secondary" tone="danger" disabled={count === 0} title="⌘Z로 실행 취소할 수 있습니다"
            onClick={() => setBlocked(removeLastCircuit(equipmentId).blocked)}
          >
            {count > 0 ? `차단기 ${count} 삭제` : '차단기 삭제'}
          </Button>
          <ErrorStrip className="min-w-0 flex-1" message={blocked} onDismiss={() => setBlocked(null)} />
          {/* 이 창은 워킹카피에 싣기만 한다 — 「완료」를 저장으로 믿고 떠나지 않게 서버로 가는 문을 짚는다(§「저장」). */}
          <span className="ml-auto shrink-0 self-center text-xs text-content-muted">수정한 내용은 상단 「저장」을 눌러야 반영됩니다</span>
          <Button variant="secondary" onClick={onClose}>완료</Button>
        </>
      )}
    >
      <CircuitTable equipmentId={equipmentId} focusNo={focusNo} />
    </Modal>
  );
}
