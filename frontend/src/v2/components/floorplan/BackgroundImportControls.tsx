/**
 * 층 배경 도면(DWG/DXF/DGN) 임포트·제거 — 도구바 오른쪽 `⋯` 안.
 *
 * 평면도(`RackPlanView`)의 도구바에 얹히지만 캔버스 연산에는 전혀 참여하지 않는다 —
 * 필요한 것은 대상 층 id 와 배경 유무뿐이라 자기 상태를 스스로 소유한다.
 */
import { useRef, useState } from 'react';
import { OverflowMenu } from '../../../components/ui';
import type { BackgroundDrawing } from '@twin/core';
import { parseBackground } from '../../api';
import { apiErrorMessage } from '../../apiError';
import { workingCopyStore } from '../../model/store/workingCopy';

interface BackgroundImportControlsProps {
  /** 대상 층. null 이면 항목이 비활성된다. */
  floorId: string | null;
  /** 배경이 이미 있으면 제거 항목을 함께 노출한다. */
  hasBackground: boolean;
}

export function BackgroundImportControls({ floorId, hasBackground }: BackgroundImportControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 읽은 것을 **층에 얹는다** — 서버로 가는 것은 저장할 때다.
   *
   * 예전에는 서버가 그 자리에서 층 행을 고쳤다(즉시 쓰기). 그래서 배경만 다른 규칙으로
   * 움직였다: 되돌리기가 듣지 않고, 잘못 물린 도면도 이미 들어가 있었다.
   */
  function stage(drawing: BackgroundDrawing | null) {
    if (floorId == null) return;
    workingCopyStore.getState().update('floors', floorId, { backgroundDrawing: drawing });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    // 프로젝트 관례: 비동기 이전에 e.currentTarget 을 먼저 읽는다.
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = ''; // 같은 파일 재선택 허용
    if (!file || floorId == null) return;
    setError(null);
    setBusy(true);
    void parseBackground(file)
      .then(stage)
      .catch((err) => setError(apiErrorMessage(err, '배경 도면을 읽지 못했습니다')))
      .finally(() => setBusy(false));
  }

  return (
    <>
      {error && <span className="shrink-0 text-xs text-danger">{error}</span>}
      {/* 층마다 한 번 하는 일이다 — 자주 쓰는 도구 옆에 늘 서 있을 것이 아니라 `⋯` 안이다
          (§1.7-h). 예전에는 층 탭 줄 오른쪽 끝에 버튼 둘이 상주했고, 그 줄이 통째로
          하단으로 내려가면서 갈 곳이 없어졌다. */}
      <OverflowMenu
        label="배경 도면"
        items={[
          {
            label: busy ? '임포트 중…' : '배경 임포트',
            /* 파일 대화상자는 **숨은 input** 이 연다 — 메뉴가 닫힌 뒤에도 그 노드로
               `change` 가 돌아오므로 늘 마운트해 둔다. */
            onSelect: () => inputRef.current?.click(),
            disabled: busy || floorId == null,
            disabledReason: floorId == null ? '층을 먼저 고르세요' : '읽는 중입니다',
          },
          ...(hasBackground
            ? [{ label: '배경 제거', danger: true, onSelect: () => stage(null), disabled: busy }]
            : []),
        ]}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".dwg,.dxf,.dgn"
        className="hidden"
        data-testid="background-import-input"
        onChange={handleFile}
      />
    </>
  );
}
