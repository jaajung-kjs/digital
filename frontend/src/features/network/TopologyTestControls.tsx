/**
 * 토폴로지 테스트 도구 컨트롤 바 — 경로 추가 토글, 초기화, 모드/현황 안내.
 * ReactFlow 내부 좌상단 Panel 로 표시. 상태는 NetworkTopologyModal 이 소유한다.
 */

import { Panel } from '@xyflow/react';

interface TopologyTestControlsProps {
  addMode: boolean;
  addAnchor: string | null;
  hasStart: boolean;
  hasEnd: boolean;
  pathFound: boolean;
  cutCount: number;
  addCount: number;
  onToggleAddMode: () => void;
  onReset: () => void;
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

export function TopologyTestControls(props: TopologyTestControlsProps) {
  const { addMode, cutCount, addCount, onToggleAddMode, onReset } = props;
  const hint = hintText(props);

  return (
    <Panel position="top-left">
      <div className="bg-white/95 rounded-md shadow border border-gray-200 px-3 py-2 flex flex-col gap-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAddMode}
            className={`px-2 py-1 rounded border text-[11px] font-medium ${
              addMode
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {addMode ? '추가 취소' : '경로 추가'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 text-[11px] font-medium hover:bg-gray-50"
          >
            초기화
          </button>
          <span className="text-gray-400">
            끊은 경로 {cutCount} · 추가 경로 {addCount}
          </span>
        </div>
        <span className={hint.error ? 'text-red-600' : 'text-gray-500'}>{hint.text}</span>
      </div>
    </Panel>
  );
}
