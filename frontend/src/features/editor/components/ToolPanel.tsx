import { useEditorStore } from '../stores/editorStore';
import { ToolButton } from './ToolButton';
import type { EditorTool } from '../../../types/floorPlan';

export function ToolPanel() {
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);

  const selectTool = (t: EditorTool) => setTool(t);

  return (
    <div className="w-28 shrink-0 bg-white border-r flex flex-col py-2 px-1 gap-0.5">
      <ToolButton active={tool === 'select'} onClick={() => selectTool('select')} title="선택 도구" label="선택" shortcut="V">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      </ToolButton>

      <div className="border-t my-1" />

      <ToolButton active={tool === 'line'} onClick={() => selectTool('line')} title="선 그리기" label="선" shortcut="L">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20L20 4" />
        </svg>
      </ToolButton>

      <ToolButton active={tool === 'rect'} onClick={() => selectTool('rect')} title="사각형 그리기" label="사각형" shortcut="R">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4z" />
        </svg>
      </ToolButton>

      <ToolButton active={tool === 'circle'} onClick={() => selectTool('circle')} title="원 그리기" label="원" shortcut="O">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="8" strokeWidth={2} />
        </svg>
      </ToolButton>

      <ToolButton active={tool === 'text'} onClick={() => selectTool('text')} title="텍스트 입력" label="텍스트" shortcut="T">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v12M8 18h8" />
        </svg>
      </ToolButton>

      <div className="border-t my-1" />

      <ToolButton active={tool === 'door'} onClick={() => selectTool('door')} title="문 배치" label="문" shortcut="D">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v18M3 3h18v18H3V3z" />
        </svg>
      </ToolButton>

      <ToolButton active={tool === 'window'} onClick={() => selectTool('window')} title="창문 배치" label="창문" shortcut="W">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4zm8 0v16M4 12h16" />
        </svg>
      </ToolButton>

      <div className="border-t my-1" />

      <ToolButton active={tool === 'equipment'} onClick={() => selectTool('equipment')} title="설비 배치" label="설비" shortcut="K">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h14v16H5V4zm2 3h10M7 10h10M7 13h10M7 16h10" />
        </svg>
      </ToolButton>

      <div className="border-t my-1" />

      <ToolButton active={tool === 'delete'} onClick={() => selectTool('delete')} title="삭제 모드" label="삭제" shortcut="Del" danger>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </ToolButton>
    </div>
  );
}
