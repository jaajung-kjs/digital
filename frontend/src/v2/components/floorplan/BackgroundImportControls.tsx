/**
 * 층 배경 도면(DWG/DXF/DGN) 임포트·제거 버튼.
 *
 * FloorPlanView 의 층 탭 바에 얹히지만 캔버스 연산에는 전혀 참여하지 않는다 —
 * 필요한 것은 대상 층 id 와 배경 유무뿐이라 자기 상태를 스스로 소유한다.
 * (FloorPlanView 는 이미 8개 관심사를 안고 있는 1,200줄 파일이고, 그 관심사들은
 *  캔버스 상태를 공유해 떼어낼 수 없다. 이건 공유하지 않으므로 떼어낸다.)
 */
import { useRef, useState } from 'react';
import { Button } from '../../../components/ui';
import type { BackgroundDrawing } from '@twin/core';
import { parseBackground } from '../../api';
import { apiErrorMessage } from '../../apiError';
import { useV2WorkingCopy } from '../../store/workingCopyStore';

interface BackgroundImportControlsProps {
  /** 대상 층. null 이면 버튼이 비활성된다. */
  floorId: string | null;
  /** 배경이 이미 있으면 제거 버튼을 함께 노출한다. */
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
    useV2WorkingCopy.getState().stageFloorUpdate(floorId, { backgroundDrawing: drawing });
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
    <div className="ml-auto flex items-center gap-2 px-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || floorId == null}
        data-testid="background-import-button"
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '임포트 중…' : '배경 임포트'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".dwg,.dxf,.dgn"
        className="hidden"
        data-testid="background-import-input"
        onChange={handleFile}
      />
      {hasBackground && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          data-testid="background-remove-button"
          onClick={() => stage(null)}
        >
          배경 제거
        </Button>
      )}
    </div>
  );
}
