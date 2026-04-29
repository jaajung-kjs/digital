import { useEditorStore } from '../stores/editorStore';
import { ToolButton } from './ToolButton';
import type { EditorTool } from '../../../types/floorPlan';

export function ToolPanel() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  const selectTool = (t: EditorTool) => setTool(t);

  return (
    <div className="w-28 shrink-0 bg-white border-r flex flex-col py-2 px-1 gap-0.5">
      <ToolButton active={tool === 'select'} onClick={() => selectTool('select')} title="선택 도구" label="선택" shortcut="V">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      </ToolButton>

      <div className="border-t my-1" />

      <ToolButton active={tool === 'equipment'} onClick={() => selectTool('equipment')} title="설비 배치 (랙 포함)" label="설비" shortcut="K">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h14v16H5V4zm2 3h10M7 10h10M7 13h10M7 16h10" />
        </svg>
      </ToolButton>

      <ToolButton active={tool === 'cable'} onClick={() => selectTool('cable')} title="케이블 경로 그리기" label="케이블" shortcut="C">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </ToolButton>
    </div>
  );
}
