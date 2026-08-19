/**
 * V2StandardsPage — 「적산 기준」 화면
 *
 * 설계에 쓰는 **바깥에서 오는 표**를 서버에 올려 둔다. 관리자가 반기에 한 번 올리면 전원이
 * 같은 값을 쓴다 — 각자 파일을 들고 있으면 사람마다 다른 산출 내역가 나온다.
 *
 * 왜 대장이 아니라 별도 화면인가: 대장의 세 탭은 **우리가 만드는 종류**이고, 이것은 받아
 * 오는 표다. 대장 안에 탭으로 넣었더니 그 탭만 왼쪽 목록이 사라져 화면이 덜컹거렸다.
 *
 * 판은 앱의 다른 화면과 같다 — `목록 │ 캔버스`. 왼쪽에서 무엇을 볼지 고르고, 오른쪽이 그것을
 * 채운다.
 */
import { useState } from 'react';
import { ErrorStrip, TreePanel, type TreeNode } from '../../components/ui';

import { OverheadRatesView, StandardHistoryView, WageRatesView } from '../components/admin/StandardsPanel';

type View = 'wage' | 'overhead' | 'history';

export default function V2StandardsPage() {
  const [view, setView] = useState<View>('wage');
  const [error, setError] = useState<string | null>(null);

  /* 무엇이 들어와 있는지는 **오른쪽 캔버스가** 말한다. 예전에는 항목 옆 흐린 자리에
     `123`·`전기통신소방전문`·`3` 을 섞어 넣었는데, 같은 자리의 같은 서체가 어떤 것은 개수,
     어떤 것은 낱말이라 읽는 사람이 규칙을 세울 수 없었다. */
  const nodes: TreeNode[] = [
    { id: 'wage', label: '노임단가', text: '노임단가', depth: 0 },
    { id: 'overhead', label: '제비율', text: '제비율', depth: 0 },
    { id: 'history', label: '올린 기록', text: '올린 기록', depth: 0 },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ErrorStrip
        message={error}
        onDismiss={() => setError(null)}
        className="shrink-0 border-b border-line bg-danger-bg px-4 py-1"
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
          <TreePanel
            title="적산 기준"
            nodes={nodes}
            selectedId={view}
            /* 적산 기준는 늘 하나를 보고 있다 — 놓을 것이 없으므로 다시 눌러도 그대로 둔다. */
            onSelect={(n) => n && setView(n.id as View)}
          />
        </aside>
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 캔버스 머리줄 — **다섯 화면이 같은 자리에 「지금 무엇을 보고 있나」를 적는다.**
              여기만 머리줄이 없어서 카드가 곧장 시작했고, 화면을 옮길 때 첫 줄의 높이가
              달라 보였다. 고칠 대상이 없는 화면이라 오른쪽에 놓을 것은 없다. */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
            <span className="text-sm font-semibold text-content">
              {nodes.find((n) => n.id === view)?.text}
            </span>
          </div>
        {/* 스크롤은 **이 상자**가 맡는다. 안쪽 표에 스크롤 상자를 또 만들지 않는다
            (CONVENTIONS §1.7-b) — 만들면 `TableCard` 가 넘치는 행을 스크롤바 없이 잘라 낸다. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 여백은 스크롤되는 **안쪽**에 — 스크롤 상자에 주면 고정 머리글이 그만큼
              내려가 붙는다(§1.7-b). */}
          <div className="p-4">
            {view === 'wage' && <WageRatesView onError={setError} />}
            {view === 'overhead' && <OverheadRatesView onError={setError} />}
            {view === 'history' && <StandardHistoryView onError={setError} />}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
