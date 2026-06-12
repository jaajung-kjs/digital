/**
 * 토폴로지 테스트 도구 컨트롤 바 — 경로 추가 토글, 초기화, 시작/종료 칩, 모드/현황 안내.
 * ReactFlow 내부 좌상단 Panel 로 표시. 상태는 NetworkTopologyModal 이 소유한다.
 */

import { Panel } from '@xyflow/react';

interface TopologyTestControlsProps {
  addMode: boolean;
  addAnchor: string | null;
  hasStart: boolean;
  hasEnd: boolean;
  pathFound: boolean;
  startLabel: string | null;
  endLabel: string | null;
  cutCount: number;
  addCount: number;
  onToggleAddMode: () => void;
  onReset: () => void;
  onClearStart: () => void;
  onClearEnd: () => void;
}

/** 현재 상태에 맞는 안내 문구 — error tone 이면 빨강. */
function hintText(p: TopologyTestControlsProps): { text: string; error: boolean } {
  if (p.addMode) {
    return {
      text: p.addAnchor ? '경로 추가: 연결할 노드를 클릭하세요' : '경로 추가: 시작 노드를 클릭하세요',
      error: false,
    };
  }
  if (!p.hasStart) return { text: '노드를 클릭해 경로찾기 시작점을 선택하세요', error: false };
  if (!p.hasEnd) return { text: '종료 노드를 클릭하세요', error: false };
  return p.pathFound
    ? { text: '최단 경로 표시됨', error: false }
    : { text: '경로 없음 — 두 노드가 끊겨 있습니다', error: true };
}

/** 시작/종료 엣드포인트 칩 — 노드명 + 해제(×). 색은 캔버스 배지와 일치. */
function EndpointChip({
  role,
  label,
  onClear,
}: {
  role: 'start' | 'end';
  label: string;
  onClear: () => void;
}) {
  const isStart = role === 'start';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
        isStart ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
      }`}
    >
      {isStart ? '시작' : '종료'}: {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={isStart ? '시작점 해제' : '종료점 해제'}
        className="leading-none text-sm hover:opacity-60"
      >
        ×
      </button>
    </span>
  );
}

export function TopologyTestControls(props: TopologyTestControlsProps) {
  const { addMode, startLabel, endLabel, cutCount, addCount, onToggleAddMode, onReset, onClearStart, onClearEnd } =
    props;
  const hint = hintText(props);

  return (
    <Panel position="top-left">
      <div className="bg-surface/95 rounded-md shadow border border-line px-3 py-2 flex flex-col gap-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={addMode}
            onClick={onToggleAddMode}
            className={`px-2 py-1 rounded border text-[11px] font-medium ${
              addMode
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-content border-line hover:bg-surface-2'
            }`}
          >
            {addMode ? '추가 취소' : '경로 추가'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-2 py-1 rounded border border-line bg-surface text-content text-[11px] font-medium hover:bg-surface-2"
          >
            초기화
          </button>
          <span className="text-content-faint">
            끊은 경로 {cutCount} · 추가 경로 {addCount}
          </span>
        </div>
        {(startLabel || endLabel) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {startLabel && <EndpointChip role="start" label={startLabel} onClear={onClearStart} />}
            {endLabel && <EndpointChip role="end" label={endLabel} onClear={onClearEnd} />}
          </div>
        )}
        <span className={hint.error ? 'text-danger' : 'text-content-muted'}>{hint.text}</span>
      </div>
    </Panel>
  );
}
