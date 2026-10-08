/**
 * V2StandardsPage — 「기준정보」 화면
 *
 * 설계에 쓰는 **바깥에서 오는 표**(노임단가·제비율)를 서버에 올려 둔다. 관리자가 반기에 한 번
 * 올리면 전원이 같은 값을 쓴다 — 각자 파일을 들고 있으면 사람마다 다른 산출 내역이 나온다.
 *
 * 탭 셋이 표를 폭 가득 채운다. 무엇이 들어와 있는지는 탭 안의 표가 말한다.
 */
import { useState } from 'react';
import { ErrorStrip, Tabs, useTabs } from '../../components/ui';
import { OverheadRatesView, StandardHistoryView, WageRatesView } from '../components/admin/StandardsPanel';

type View = 'wage' | 'overhead' | 'history';

const TABS = [
  { key: 'wage' as const, label: '노임단가' },
  { key: 'overhead' as const, label: '제비율' },
  { key: 'history' as const, label: '등록 이력' },
];

export default function V2StandardsPage() {
  const [view, setView] = useState<View>('wage');
  const [error, setError] = useState<string | null>(null);
  const t = useTabs(view);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 탭 줄 왼쪽 끝을 내용 여백(16px)에 맞춘다. */}
      <Tabs {...t.list} aria-label="기준정보" items={TABS} onChange={setView} className="pl-4" />
      <ErrorStrip
        message={error}
        onDismiss={() => setError(null)}
        className="shrink-0 border-b border-line bg-danger-bg px-4 py-1"
      />
      {/* 스크롤은 이 상자가 맡고 여백은 안쪽에 둔다(CONVENTIONS §1.7-b). */}
      <div {...t.panel} className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-4">
          {view === 'wage' && <WageRatesView onError={setError} />}
          {view === 'overhead' && <OverheadRatesView onError={setError} />}
          {view === 'history' && <StandardHistoryView onError={setError} />}
        </div>
      </div>
    </div>
  );
}
