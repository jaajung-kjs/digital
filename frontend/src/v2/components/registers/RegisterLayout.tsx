import type { ReactNode } from 'react';
import { EmptyState, Select, SelectionScope, TableCard, TableSearch } from '../../../components/ui';
import type { MediumContainerPick } from '../../useMediumContainer';

export interface RegisterLayoutProps {
  /** 어느 설비를 보고 있나 — `useMediumContainer` 가 고른다. */
  picker: MediumContainerPick;
  /** 볼 설비가 하나도 없을 때 — 무엇을 만들면 나타나는지까지 적는다. */
  empty: { title: string; description: ReactNode };
  search: {
    'aria-label': string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    /** 걸러낸 뒤 남은 행 / 거르기 전 전체. */
    shown: number;
    total: number;
  };
  /** 열 폭(%) — 열 정의는 표마다 다르다. */
  widths: number[];
  head: ReactNode;
  /** 표 하나에 들어갈 행들. `sections` 를 주면 이쪽은 쓰지 않는다. */
  children?: ReactNode;
  /**
   * 묶음마다 **표를 따로** 세운다 — 소제목 + 제 머리글 + 그 묶음의 행.
   *
   * 묶음을 표 **안**의 구분행(`colSpan`)으로 그리지 않는다: 그 줄에서 열 정의가 사라져
   * 아래 행이 무슨 열인지 다시 말해 주지 못한다. 업계 표준은 표를 끊고 새로 세우는 것이다.
   *
   * `children` 과 겹쳐 받지 않고 **따로 받는다**. 한때 `children` 하나로 둘 다 받고
   * `Array.isArray` 로 갈랐는데, JSX 는 자식 표현식이 둘만 돼도 배열을 넘긴다 —
   * 묶음이 없는 계통 표가 통째로 「구역 목록」으로 읽혀 한 행도 그려지지 않았다.
   */
  sections?: { key: string; title: ReactNode; rows: ReactNode }[];
  /** 표 아래에 딸리는 것(모달 등) — 뷰가 소유한다. */
  trailing?: ReactNode;
  /**
   * 표 **바깥**을 눌렀을 때 — 고른 것을 놓는다.
   *
   * 「다시 누르면 풀린다」와 짝이다. 스무 줄쯤 내려가 있으면 고른 줄을 다시 찾아 누르는
   * 것보다 여백을 누르는 편이 빠르고, 그것이 사람들이 먼저 해 보는 동작이다.
   */
  onClearSelection?: () => void;
}

/**
 * 등록부 화면의 껍데기 — **선번장과 계통이 같은 판을 쓴다**.
 *
 * 둘은 같은 일을 한다: 설비를 고르고 → 그 설비의 행을 만들고 → 표로 그리고 → 칸을 그 자리에서
 * 고친다. 다른 것은 **열 정의와 행 빌더뿐**이다.
 *
 * 예전에는 두 파일이 상단 바를 통째로 복사해 갖고 있었다 — 주석까지 한 글자도 다르지 않았다.
 * 그래서 열을 하나 더하거나 검색 자리를 옮기려면 두 곳을 고쳐야 했고, 실제로 한쪽만 고쳐져
 * 미묘하게 어긋난 적이 있다.
 *
 * **거르는 일은 뷰가 한다.** 어떤 열이 있고 무엇으로 걸러야 하는지는 표마다 다르고 여기서 알
 * 방법도 없다 — 이 컴포넌트는 자리와 건수만 맡는다(`TableSearch` 와 같은 규칙).
 */
export function RegisterLayout({
  picker, empty, search, widths, head, children, sections, trailing, onClearSelection,
}: RegisterLayoutProps) {
  if (picker.options.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        {/* 폭은 **감싸는 칸**이 정한다 — `<select>` 에 직접 걸면 화살표(래퍼 기준 절대배치)만
            멀찍이 떨어져 남는다. 실제로 그렇게 돼 있었다. */}
        <div className="w-64 shrink-0">
          <Select
            aria-label="설비 선택"
            value={picker.activeKey}
            size="sm"
            onChange={(e) => picker.setActiveKey(e.currentTarget.value)}
          >
            {picker.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <TableSearch {...search} />
      </div>

      {/* 여백은 **스크롤되는 안쪽**에 준다 — 스크롤 상자에 직접 주면 고정 머리글이 그
          여백만큼 내려가 붙고, 그 틈으로 지나가는 행이 비친다(§1.7-b). */}
      {/* 표가 **선택의 주인**이다 — 여백을 누르면 풀린다. 예전에는 이 상자에 직접
          `e.target === e.currentTarget` 을 걸어, 안쪽 여백(패딩·표 아래)은 안 걸렸다. */}
      <SelectionScope onClear={() => onClearSelection?.()} className="min-h-0 flex-1 overflow-auto">
        <div className="p-4">
        {sections ? (
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <section key={section.key} className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-content">{section.title}</h3>
                <TableCard widths={widths}>
                  <thead>
                    {/* 묶음마다 제 머리글이 제 표 위에 붙어 따라온다 — 96행을 내려가도
                        지금 보는 칸이 무슨 열인지 잃지 않는다. */}
                    <tr className="sticky top-0 z-sticky border-b border-line">{head}</tr>
                  </thead>
                  <tbody>{section.rows}</tbody>
                </TableCard>
              </section>
            ))}
          </div>
        ) : (
          <TableCard widths={widths}>
            <thead>
              <tr className="sticky top-0 z-sticky border-b border-line">{head}</tr>
            </thead>
            <tbody>{children}</tbody>
          </TableCard>
        )}
        </div>
      </SelectionScope>
      {trailing}
    </div>
  );
}
