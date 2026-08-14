import type { ReactNode } from 'react';
import { EmptyState, Select, TableCard, TableSearch } from '../../../components/ui';
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
  /**
   * 표에 들어갈 행들 — **한 덩이면 표 하나, 여러 덩이면 표 여러 개**.
   *
   * 묶음을 표 **안**의 구분행으로 그리지 않는다. 업계 표준은 묶음마다 제 머리글을 가진
   * 표를 따로 세우는 것이다: 스크롤해 내려가도 지금 보는 열이 무엇인지 알 수 있고,
   * 묶음마다 정렬·소계가 따로 붙을 수 있다. 구분행은 그 자리에서 열 정의를 잃는다.
   */
  children: ReactNode | { key: string; title: ReactNode; rows: ReactNode }[];
  /** 표 아래에 딸리는 것(모달 등) — 뷰가 소유한다. */
  trailing?: ReactNode;
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
  picker, empty, search, widths, head, children, trailing,
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

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {Array.isArray(children) ? (
          <div className="flex flex-col gap-4">
            {children.map((section) => (
              <section key={section.key} className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-content">{section.title}</h3>
                <TableCard widths={widths}>
                  <thead>
                    <tr className="border-b border-line">{head}</tr>
                  </thead>
                  <tbody>{section.rows}</tbody>
                </TableCard>
              </section>
            ))}
          </div>
        ) : (
          <TableCard widths={widths}>
            <thead>
              <tr className="border-b border-line">{head}</tr>
            </thead>
            <tbody>{children}</tbody>
          </TableCard>
        )}
      </div>
      {trailing}
    </div>
  );
}
