import { useEffect, useState } from 'react';
import { Button, ErrorStrip, Modal } from '../../../components/ui';
import { removeLastCircuit } from '../../model/store/deleteActions';
import { CircuitTable } from './CircuitTable';

interface Props {
  equipmentId: string;
  equipmentName: string;
  open: boolean;
  /** 표시할 차단기 — 요약 줄을 눌렀거나 방금 더한 줄. 없으면 표만 연다. */
  focusNo: number | null;
  onAdd: () => void;
  onClose: () => void;
}

/**
 * 차단기 편집 창 — 9열 표는 **넓은 대화상자 안에서만** 선다(364px 패널에 두면 글자가 세로로 쪼개진다).
 *
 * 차단기는 수로만 생긴다: 더하기는 끝에 한 줄, 지우기는 마지막 한 줄. 지우려는 차단기에 연결이 남아 있으면
 * 아무것도 바꾸지 않고 그 자리에서 까닭을 말한다(§1.7-f).
 */
export function BreakerEditor({ equipmentId, equipmentName, open, focusNo, onAdd, onClose }: Props) {
  const [blocked, setBlocked] = useState<string | null>(null);
  /* 닫히면 까닭도 걷는다 — 다시 열었을 때 지난 일이 남아 있으면 지금 막힌 것처럼 읽힌다. */
  useEffect(() => { if (!open) setBlocked(null); }, [open]);

  return (
    <Modal
      open={open} onClose={onClose} title={`차단기 — ${equipmentName}`} size="xl"
      /* 더하기·지우기는 바닥 띠에 — 표가 길어도(스무 줄) 굴리지 않고 닿는다. 까닭도 그 옆에 뜬다. */
      footer={(
        <>
          <Button variant="secondary" onClick={() => { setBlocked(null); onAdd(); }}>차단기 추가</Button>
          <Button variant="secondary" onClick={() => setBlocked(removeLastCircuit(equipmentId).blocked)}>마지막 차단기 지우기</Button>
          <ErrorStrip className="min-w-0 flex-1" message={blocked} onDismiss={() => setBlocked(null)} />
          <Button variant="secondary" className="ml-auto" onClick={onClose}>닫기</Button>
        </>
      )}
    >
      <CircuitTable equipmentId={equipmentId} focusNo={focusNo} />
    </Modal>
  );
}
