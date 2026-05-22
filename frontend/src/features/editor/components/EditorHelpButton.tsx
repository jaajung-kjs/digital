import { useState } from 'react';

const WORKFLOW: { step: string; text: string }[] = [
  { step: '1', text: '도면 가져오기 — 우상단 ⚙️ 에서 DWG/DXF 임포트' },
  { step: '2', text: '설비 배치 — 왼쪽 [설비]/[랙 프리셋] 선택 후 캔버스 클릭' },
  { step: '3', text: '케이블 연결 — 왼쪽 [케이블] 그룹 선택 후 두 객체 클릭' },
];

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '1 / 2 / 3', desc: '선택 / 설비 / 케이블 도구' },
  { keys: 'ESC', desc: '취소 · 선택 도구로 복귀' },
  { keys: 'Delete', desc: '선택 항목 삭제' },
  { keys: 'Ctrl+Z / Ctrl+Y', desc: '실행취소 / 다시실행' },
  { keys: 'Ctrl+0', desc: '화면 맞춤' },
  { keys: 'Ctrl+C / Ctrl+V', desc: '설비 복사 / 붙여넣기' },
  { keys: 'Ctrl+S', desc: '저장' },
  { keys: 'G / S', desc: '그리드 / 스냅 토글' },
  { keys: 'Space + 드래그', desc: '화면 이동' },
  { keys: '방향키', desc: '선택 설비 이동 (Shift 5배)' },
];

/**
 * 캔버스 우상단 도움말 버튼. 작업 흐름과 단축키를 담은 팝오버를 토글한다.
 * EmptyStateGuide 가 도면에 콘텐츠가 생기면 사라지는 것과 달리, 이 버튼은
 * 항상 노출돼 언제든 안내를 다시 볼 수 있다.
 */
export function EditorHelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
        title="도움말"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">작업 흐름</h4>
            <ol className="space-y-1.5 mb-3">
              {WORKFLOW.map((w) => (
                <li key={w.step} className="flex gap-2 text-xs text-gray-600">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold flex items-center justify-center">
                    {w.step}
                  </span>
                  <span>{w.text}</span>
                </li>
              ))}
            </ol>
            <h4 className="text-sm font-semibold text-gray-900 mb-2 border-t border-gray-100 pt-3">
              단축키
            </h4>
            <table className="w-full text-xs">
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.keys}>
                    <td className="py-0.5 pr-3 font-mono text-gray-500 whitespace-nowrap align-top">
                      {s.keys}
                    </td>
                    <td className="py-0.5 text-gray-700">{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
